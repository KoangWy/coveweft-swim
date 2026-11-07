"use client";

import {
  ArrowDown,
  ArrowUp,
  EyeSlash,
  ImageSquare,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { IconButton } from "@/components/ui/icon-button";
import { ProductImage } from "@/components/ui/product-image";
import { useToast } from "@/components/ui/toast";
import { deleteImageAction, reorderImagesAction } from "@/features/admin/actions";
import { useRouter } from "@/i18n/navigation";
import type { ErrorCode } from "@/server/errors";

/** Must match `MAX_IMAGE_BYTES` in `src/server/media/types.ts`. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_MB = 5;
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];

export type AdminImageItem = {
  id: string;
  source: "release" | "upload";
  isVisible: boolean;
  thumb: string | null;
  full: string | null;
  alt: string;
};

type UploadResponse = { ok: true } | { ok: false; error: { code: ErrorCode } };

export type AdminProductImagesProps = {
  productId: string;
  images: AdminImageItem[];
  fallbackLabel: string;
};

/** Uploads new images, reorders the gallery, and removes or hides images. */
export function AdminProductImages({ productId, images, fallbackLabel }: AdminProductImagesProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const toast = useToast();
  const router = useRouter();
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(images);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingImage, setPendingImage] = useState<AdminImageItem | null>(null);
  const [dialogError, setDialogError] = useState<ErrorCode | null>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setUploadError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setUploadError(t("images.typeError"));
      setFile(null);
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_IMAGE_BYTES) {
      setUploadError(t("images.sizeError", { size: MAX_IMAGE_MB }));
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selected);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file || uploading) {
      return;
    }

    setUploading(true);
    setUploadError(null);
    const data = new FormData();
    data.set("file", file);

    try {
      const response = await fetch(`/${locale}/admin/products/${productId}/images`, {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as UploadResponse;

      if (body.ok) {
        inputRef.current?.form?.reset();
        setFile(null);
        toast.show({ tone: "success", title: t("images.uploaded") });
        router.refresh();
      } else {
        setUploadError(te(body.error.code));
      }
    } catch {
      setUploadError(te("INTERNAL"));
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= items.length || pending) {
      return;
    }

    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);

    startTransition(async () => {
      const result = await reorderImagesAction(
        productId,
        next.map((image) => image.id),
      );

      if (result.ok) {
        toast.show({ tone: "success", title: t("images.reordered") });
        router.refresh();
      } else {
        setItems(previous);
        toast.show({ tone: "error", title: te(result.code) });
      }
    });
  }

  function confirmImage() {
    if (!pendingImage) {
      return;
    }

    setDialogError(null);
    startTransition(async () => {
      const result = await deleteImageAction(pendingImage.id);

      if (result.ok) {
        if (pendingImage.source === "upload") {
          setItems((current) => current.filter((image) => image.id !== pendingImage.id));
          toast.show({ tone: "success", title: t("images.deleted") });
        } else {
          setItems((current) =>
            current.map((image) =>
              image.id === pendingImage.id ? { ...image, isVisible: false } : image,
            ),
          );
          toast.show({ tone: "success", title: t("images.hiddenToast") });
        }
        setPendingImage(null);
        router.refresh();
      } else {
        setDialogError(result.code);
      }
    });
  }

  const deleting = pendingImage?.source === "upload";

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={upload}
        className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:p-5"
      >
        <label htmlFor="admin-image-file" className="text-small font-medium text-navy-900">
          {t("images.file")}
        </label>
        <input
          ref={inputRef}
          id="admin-image-file"
          name="file"
          type="file"
          accept="image/webp,image/jpeg,image/png"
          onChange={chooseFile}
          className="block w-full rounded-md text-small text-navy-900 file:mr-3 file:h-9 file:shrink-0 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:text-small file:font-semibold file:text-white hover:file:bg-navy-800"
        />
        <p className="text-small text-neutral-600">{t("images.hint", { size: MAX_IMAGE_MB })}</p>
        {uploadError ? <FormAlert>{uploadError}</FormAlert> : null}
        <div>
          <Button type="submit" disabled={!file || uploading} aria-busy={uploading}>
            <UploadSimple aria-hidden size={18} />
            {uploading ? t("images.uploading") : t("images.upload")}
          </Button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-neutral-300 p-5 text-small text-neutral-700">
          <ImageSquare aria-hidden size={20} />
          {t("images.empty")}
        </p>
      ) : (
        <>
          <p className="text-small text-neutral-600">{t("images.reorderHint")}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((image, index) => (
              <li
                key={image.id}
                className="flex min-w-0 flex-col gap-2 rounded-md border border-neutral-200 bg-white p-2"
              >
                <div className="overflow-hidden rounded-md">
                  <ProductImage
                    src={image.thumb}
                    alt={image.alt}
                    fallbackLabel={fallbackLabel}
                    sizes="(min-width: 1024px) 20vw, 40vw"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={image.source === "upload" ? "accent" : "neutral"}>
                    {image.source === "upload" ? t("images.uploadSource") : t("images.release")}
                  </Badge>
                  {image.isVisible ? null : <Badge tone="warning">{t("images.hidden")}</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton
                    size="sm"
                    label={t("images.moveUp")}
                    icon={<ArrowUp aria-hidden size={16} />}
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || pending}
                  />
                  <IconButton
                    size="sm"
                    label={t("images.moveDown")}
                    icon={<ArrowDown aria-hidden size={16} />}
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1 || pending}
                  />
                  {image.isVisible ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setDialogError(null);
                        setPendingImage(image);
                      }}
                    >
                      {image.source === "upload" ? (
                        <Trash aria-hidden size={16} />
                      ) : (
                        <EyeSlash aria-hidden size={16} />
                      )}
                      {image.source === "upload" ? t("images.delete") : t("images.hide")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={pendingImage !== null}
        onClose={() => setPendingImage(null)}
        title={deleting ? t("images.deleteTitle") : t("images.hideTitle")}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingImage(null)} disabled={pending}>
              {t("images.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmImage} disabled={pending}>
              {pending
                ? t("images.saving")
                : deleting
                  ? t("images.confirmDelete")
                  : t("images.confirmHide")}
            </Button>
          </>
        }
      >
        <p className="text-body text-neutral-700">
          {deleting ? t("images.deleteBody") : t("images.hideBody")}
        </p>
        {dialogError ? (
          <p role="alert" className="mt-4 text-small text-error-700">
            {te(dialogError)}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
