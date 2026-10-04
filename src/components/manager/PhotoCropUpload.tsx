"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/actions/result";

const MAX_BYTES = 10 * 1024 * 1024;
const ASPECTS: Record<string, number> = {
  gallery: 4 / 3,
  cover: 16 / 9,
  staff: 1,
  service: 4 / 3,
  other: 4 / 3,
};
const KINDS = ["gallery", "cover", "staff", "service", "other"] as const;

type Props = {
  tenantId: string;
  action: (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
};

/** Recadre la zone choisie dans une image (côté navigateur), au plus 2400 px de large. */
async function cropToBlob(source: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const scale = Math.min(1, 2400 / area.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  canvas
    .getContext("2d")!
    .drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop"))), "image/jpeg", 0.92),
  );
}

/**
 * Ajout d'une photo par la gérante : choix de l'emplacement, recadrage au bon
 * format avec aperçu, puis envoi. Le serveur compresse et nettoie ensuite l'image.
 */
export function PhotoCropUpload({ tenantId, action }: Props) {
  const t = useTranslations("manager.photos");
  const tPhotos = useTranslations("admin.tenant.photos");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("gallery");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [canCrop, setCanCrop] = useState(true);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [alt, setAlt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    if (source) URL.revokeObjectURL(source);
    setFile(null);
    setSource(null);
    setZoom(1);
    setAlt("");
  }

  function choose(selected: File | undefined) {
    setMessage(null);
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setMessage({ ok: false, text: t("tooLarge") });
      return;
    }
    const url = URL.createObjectURL(selected);
    // Certains formats (HEIC) ne s'affichent pas dans tous les navigateurs : envoi sans recadrage.
    const probe = new Image();
    probe.onload = () => setCanCrop(true);
    probe.onerror = () => setCanCrop(false);
    probe.src = url;
    setFile(selected);
    setSource(url);
  }

  async function send() {
    if (!file || !source) return;
    setPending(true);
    const data = new FormData();
    data.set("tenantId", tenantId);
    data.set("kind", kind);
    data.set("alt", alt);
    data.set(
      "file",
      canCrop && area
        ? new File([await cropToBlob(source, area)], "photo.jpg", { type: "image/jpeg" })
        : file,
    );
    const result = await action(null, data);
    setPending(false);
    if (result.ok) {
      reset();
      setMessage({ ok: true, text: tCommon("saved") });
    } else setMessage({ ok: false, text: tErrors(result.error) });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="photo-kind" className={ui.label}>
          {tPhotos("kind")}
        </label>
        <select
          id="photo-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as (typeof KINDS)[number])}
          className={ui.input}
        >
          {KINDS.map((value) => (
            <option key={value} value={value}>
              {tPhotos(`kinds.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {!source ? (
        <label className={`${ui.secondaryButton} cursor-pointer`}>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          📷 {t("choose")}
        </label>
      ) : (
        <div className="space-y-3">
          {canCrop ? (
            <>
              <p className={ui.label}>{t("crop")}</p>
              <div className="relative h-72 overflow-hidden rounded-[var(--radius-card)] bg-ink">
                <Cropper
                  image={source}
                  crop={crop}
                  zoom={zoom}
                  aspect={ASPECTS[kind]}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, pixels) => setArea(pixels)}
                />
              </div>
              <label className="flex items-center gap-3">
                <span className="text-sm font-semibold text-navy">{t("zoom")}</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="flex-1 accent-navy"
                />
              </label>
            </>
          ) : (
            <p className="text-sm text-ink/70">{t("noCrop")}</p>
          )}
          <div>
            <label htmlFor="photo-alt" className={ui.label}>
              {tPhotos("alt")}
            </label>
            <input
              id="photo-alt"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              className={ui.input}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={send} disabled={pending} className={`${ui.primaryButton} flex-1`}>
              {pending ? t("sending") : t("send")}
            </button>
            <button type="button" onClick={reset} className={`${ui.secondaryButton} w-auto`}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? ui.success : ui.error}>
          {message.text}
        </p>
      )}
    </div>
  );
}
