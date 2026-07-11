import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts,
} from "pdf-lib";
import type {
  CreateFormInput,
  FileDTO,
  FillFormInput,
  FormFieldInfo,
} from "@pdfforge/shared";
import * as activity from "./activity.service";
import { toFileDTO } from "./file.service";
import { badRequest } from "../lib/errors";
import { saveGeneratedAny } from "./output.service";
import { getOwnedPdf, loadPdf, overwrite, stripExtension, withPdfExtension } from "./pdf.service";

/** Lists AcroForm fields with type, value, options and first-widget position. */
export async function inspect(userId: string, fileId: string): Promise<FormFieldInfo[]> {
  const file = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);
  const form = doc.getForm();
  const pages = doc.getPages();

  return form.getFields().map((field) => {
    let type: FormFieldInfo["type"] = "button";
    let value: FormFieldInfo["value"] = null;
    let options: string[] = [];

    if (field instanceof PDFTextField) {
      type = "text";
      value = field.getText() ?? "";
    } else if (field instanceof PDFCheckBox) {
      type = "checkbox";
      value = field.isChecked();
    } else if (field instanceof PDFRadioGroup) {
      type = "radio";
      value = field.getSelected() ?? null;
      options = field.getOptions();
    } else if (field instanceof PDFDropdown) {
      type = "dropdown";
      value = field.getSelected();
      options = field.getOptions();
    } else if (field instanceof PDFOptionList) {
      type = "optionlist";
      value = field.getSelected();
      options = field.getOptions();
    } else if (field.constructor.name === "PDFSignature") {
      type = "signature";
    }

    // Resolve the first widget's page + rectangle (top-left origin).
    let page: number | null = null;
    let rect: FormFieldInfo["rect"] = null;
    try {
      const widget = field.acroField.getWidgets()[0];
      if (widget) {
        const r = widget.getRectangle();
        const pageRef = widget.P();
        const idx = pages.findIndex((p) => p.ref === pageRef);
        if (idx >= 0) {
          page = idx;
          const pageH = pages[idx]!.getHeight();
          rect = { x: r.x, y: pageH - r.y - r.height, w: r.width, h: r.height };
        }
      }
    } catch {
      // Position stays null for exotic widgets; the field is still usable.
    }

    return {
      name: field.getName(),
      type,
      value,
      options,
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
      page,
      rect,
    };
  });
}

export async function fill(
  userId: string,
  fileId: string,
  input: FillFormInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);
  const form = doc.getForm();

  for (const [name, value] of Object.entries(input.values)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      throw badRequest(`No form field named "${name}"`, "UNKNOWN_FIELD");
    }
    if (field instanceof PDFTextField) {
      field.setText(String(value));
    } else if (field instanceof PDFCheckBox) {
      if (value === true || value === "true") field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
      field.select(String(value));
    } else if (field instanceof PDFOptionList) {
      field.select(Array.isArray(value) ? value : [String(value)]);
    } else {
      throw badRequest(`Field "${name}" cannot be filled`, "UNSUPPORTED_FIELD");
    }
  }

  if (input.flatten) form.flatten();

  const bytes = Buffer.from(await doc.save());
  const pageCount = doc.getPageCount();
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, bytes, pageCount)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-filled`),
          bytes,
          "application/pdf",
          pageCount,
        );

  await activity.log(userId, "FORM_FILL", {
    fileId: result.id,
    detail: `${Object.keys(input.values).length} fields in ${file.name}${input.flatten ? " (flattened)" : ""}`,
  });
  return toFileDTO(result);
}

export async function create(
  userId: string,
  fileId: string,
  input: CreateFormInput,
): Promise<FileDTO> {
  const file = await getOwnedPdf(userId, fileId);
  const doc = await loadPdf(file);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pageCountBefore = doc.getPageCount();

  for (const spec of input.fields) {
    if (spec.page >= pageCountBefore) {
      throw badRequest(
        `Field "${spec.name}" targets page ${spec.page + 1} but the document has ${pageCountBefore} pages`,
        "PAGE_OUT_OF_BOUNDS",
      );
    }
    const page = doc.getPage(spec.page);
    const pageH = page.getHeight();
    // Client sends top-left origin; pdf-lib wants bottom-left.
    const y = pageH - spec.y - spec.h;

    try {
      switch (spec.type) {
        case "text": {
          const field = form.createTextField(spec.name);
          if (spec.multiline) field.enableMultiline();
          if (spec.defaultValue) field.setText(spec.defaultValue);
          field.addToPage(page, { x: spec.x, y, width: spec.w, height: spec.h, font });
          break;
        }
        case "checkbox": {
          const field = form.createCheckBox(spec.name);
          field.addToPage(page, { x: spec.x, y, width: spec.w, height: spec.h });
          if (spec.checked) field.check();
          break;
        }
        case "dropdown": {
          const field = form.createDropdown(spec.name);
          field.setOptions(spec.options);
          if (spec.defaultValue && spec.options.includes(spec.defaultValue)) {
            field.select(spec.defaultValue);
          }
          field.addToPage(page, { x: spec.x, y, width: spec.w, height: spec.h, font });
          break;
        }
        case "radio": {
          const field = form.createRadioGroup(spec.name);
          // Stack the options vertically inside the given box.
          const optionH = Math.min(18, spec.h / spec.options.length);
          spec.options.forEach((option, i) => {
            const oy = y + spec.h - (i + 1) * optionH;
            field.addOptionToPage(option, page, {
              x: spec.x,
              y: oy,
              width: optionH,
              height: optionH,
            });
            page.drawText(option, {
              x: spec.x + optionH + 6,
              y: oy + optionH / 4,
              size: Math.max(8, optionH * 0.6),
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
          });
          break;
        }
        case "signature": {
          // pdf-lib cannot create digital-signature fields; render a labelled
          // signature line backed by a text field for handwritten/typed signing.
          const field = form.createTextField(spec.name);
          field.addToPage(page, { x: spec.x, y, width: spec.w, height: spec.h, font });
          page.drawLine({
            start: { x: spec.x, y: y - 2 },
            end: { x: spec.x + spec.w, y: y - 2 },
            color: rgb(0.2, 0.2, 0.2),
            thickness: 1,
          });
          page.drawText("Signature", {
            x: spec.x,
            y: y - 12,
            size: 8,
            font,
            color: rgb(0.45, 0.45, 0.45),
          });
          break;
        }
      }
    } catch (err) {
      throw badRequest(
        `Could not create field "${spec.name}": ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`,
        "FIELD_CREATE_FAILED",
      );
    }
  }

  const bytes = Buffer.from(await doc.save());
  const result =
    input.mode === "replace"
      ? await overwrite(userId, file, bytes, pageCountBefore)
      : await saveGeneratedAny(
          userId,
          withPdfExtension(input.name ?? `${stripExtension(file.name)}-form`),
          bytes,
          "application/pdf",
          pageCountBefore,
        );

  await activity.log(userId, "FORM_CREATE", {
    fileId: result.id,
    detail: `${input.fields.length} fields in ${file.name}`,
  });
  return toFileDTO(result);
}
