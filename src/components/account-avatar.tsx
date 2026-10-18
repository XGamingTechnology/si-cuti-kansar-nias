"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AdminFloatingWindow } from "./admin-floating-window";
import {
  parseAvatarView,
  type AvatarView,
} from "@/application/avatar/contracts";
import "./account-avatar.css";
const empty: AvatarView = {
  version: 0,
  hasPhoto: false,
  imageUrl: null,
  updatedAt: null,
};
type State = {
  data: AvatarView;
  loading: boolean;
  error: string;
  name: string;
  refresh: () => Promise<void>;
  apply: (v: AvatarView) => void;
  epoch: number;
};
const Context = createContext<State | null>(null);
function useAvatar() {
  const v = useContext(Context);
  if (!v) throw Error("Avatar provider missing");
  return v;
}
export function AvatarProvider({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const [data, setData] = useState(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const seq = useRef(0);
  async function refresh() {
    const current = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/me/avatar", { cache: "no-store" });
      if (!r.ok) throw Error("Foto profil belum dapat dimuat. Coba lagi.");
      const v = parseAvatarView(await r.json());
      if (current === seq.current) {
        setData((old) => (old.version > v.version ? old : v));
        setEpoch((n) => n + 1);
      }
    } catch {
      if (current === seq.current)
        setError("Foto profil belum dapat dimuat. Coba lagi.");
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }
  function apply(v: AvatarView) {
    seq.current++;
    setData((old) => (old.version > v.version ? old : v));
    setEpoch((n) => n + 1);
    setLoading(false);
    setError("");
  }
  useEffect(() => {
    const sequence = seq;
    const start = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(start);
      sequence.current++;
    };
  }, []);
  return (
    <Context.Provider
      value={{ data, loading, error, name, refresh, apply, epoch }}
    >
      {children}
    </Context.Provider>
  );
}
function Picture({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    // Authenticated same-origin bytes; next/image optimisation would introduce shared caching.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" onError={() => setFailed(true)} />
  ) : (
    <>
      {name
        .split(" ")
        .slice(0, 2)
        .map((v) => v[0])
        .join("")
        .toUpperCase()}
    </>
  );
}
export function AccountAvatar({
  className,
  decorative = true,
}: {
  className: string;
  decorative?: boolean;
}) {
  const s = useAvatar();
  return (
    <span
      className={`${className} account-avatar`}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Foto profil Anda atau inisial"}
    >
      <Picture
        key={`${s.data.version}:${s.epoch}`}
        url={s.data.imageUrl}
        name={s.name}
      />
    </span>
  );
}
export function AvatarEditor() {
  const s = useAvatar(),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [canRetry, setCanRetry] = useState(false);
  const attempt = useRef<{
      action: "upload" | "delete";
      file: File | null;
      version: number;
      key: string;
    } | null>(null),
    alive = useRef(true),
    inFlight = useRef(false),
    input = useRef<HTMLInputElement>(null),
    saveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (file) saveButton.current?.focus();
  }, [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function choose(f: File | undefined) {
    setCanRetry(false);
    setError("");
    setNotice("");
    attempt.current = null;
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (
      !["image/jpeg", "image/png"].includes(f.type) ||
      !f.size ||
      f.size > 5 * 1024 * 1024
    ) {
      setFile(null);
      setPreview(null);
      setError("Pilih JPEG/PNG berukuran maksimal 5 MiB. Foto belum berubah.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    saveButton.current?.focus();
  }
  async function mutate(action: "upload" | "delete") {
    if (
      inFlight.current ||
      s.loading ||
      s.error ||
      (action === "upload" && !file)
    )
      return;
    const a =
      attempt.current?.action === action && attempt.current.file === file
        ? attempt.current
        : { action, file, version: s.data.version, key: crypto.randomUUID() };
    attempt.current = a;
    inFlight.current = true;
    setBusy(true);
    setCanRetry(false);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/me/avatar", {
        method: action === "upload" ? "PUT" : "DELETE",
        headers: {
          "if-match": `"${a.version}"`,
          "idempotency-key": a.key,
          ...(action === "upload" ? { "content-type": file!.type } : {}),
        },
        body: action === "upload" ? file : undefined,
        cache: "no-store",
      });
      let value;
      try {
        value = await r.json();
      } catch {
        throw Error(
          "Respons server tidak lengkap. Muat ulang foto atau coba lagi dengan permintaan yang sama.",
        );
      }
      if (!r.ok) {
        if (r.status === 409) {
          attempt.current = null;
          await s.refresh();
          throw Error(
            "Foto telah berubah atau kunci retry berbeda. Periksa foto terbaru lalu simpan kembali.",
          );
        }
        throw Error(
          r.status === 401
            ? "Sesi berakhir. Masuk kembali."
            : (value.error ?? "Foto belum dapat disimpan. Coba lagi."),
        );
      }
      s.apply(parseAvatarView(value));
      if (!alive.current) return;
      setFile(null);
      setPreview(null);
      if (input.current) input.current.value = "";
      attempt.current = null;
      setConfirm(false);
      setNotice(
        typeof value.appliedVersion === "number" &&
          value.appliedVersion < value.version
          ? "Permintaan sebelumnya sudah diproses. Foto terbaru dimuat; perubahan yang lebih baru dipertahankan."
          : action === "delete"
            ? "Foto profil dihapus. Inisial digunakan."
            : "Foto profil tersimpan.",
      );
    } catch (e) {
      if (alive.current) setCanRetry(attempt.current !== null);
      if (alive.current)
        setError(
          e instanceof TypeError
            ? "Koneksi terputus. Coba lagi; permintaan memakai kunci retry yang sama. Muat ulang untuk memastikan foto terbaru."
            : e instanceof Error
              ? e.message
              : "Foto belum dapat diproses.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="avatar-editor" aria-label="Foto profil pribadi">
      <h2>Foto profil</h2>
      <div className="avatar-editor-layout">
        <AccountAvatar className="profile-avatar" decorative={false} />
        {preview && (
          <div>
            <span className="avatar-preview">
              {/* Preview local only; the server still validates/normalises decoded bytes on Save. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={preview}
                src={preview}
                alt="Pratinjau foto pilihan, belum disimpan"
                onError={() =>
                  setError(
                    "Pratinjau tidak dapat dibuka. Pilih gambar JPEG/PNG yang valid.",
                  )
                }
              />
            </span>
            <p>Belum disimpan</p>
          </div>
        )}
        <div className="avatar-editor-controls">
          <p>
            JPEG atau PNG, maksimal 5 MiB. Foto disesuaikan hingga 512 × 512;
            metadata gambar dihapus.
          </p>
          <label className="secondary-button button-link avatar-file-label">
            {s.data.hasPhoto ? "Ganti foto" : "Pilih foto"}
            <input
              ref={input}
              aria-label="Pilih foto profil"
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy || s.loading}
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
          <button
            ref={saveButton}
            type="button"
            className="primary-button"
            disabled={!file || busy || s.loading || Boolean(s.error)}
            onClick={() => void mutate("upload")}
          >
            Simpan foto
          </button>
          {file && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setPreview(null);
                attempt.current = null;
                if (input.current) input.current.value = "";
              }}
            >
              Batalkan pilihan
            </button>
          )}
          {s.data.hasPhoto && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || s.loading || Boolean(s.error)}
              onClick={() => {
                setConfirm(true);
                setError("");
              }}
            >
              Hapus foto
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void s.refresh()}
          >
            Muat ulang foto
          </button>
        </div>
      </div>
      {(s.loading || busy) && (
        <p role="status">{busy ? "Memproses foto…" : "Memuat foto…"}</p>
      )}
      {(error || s.error) && (
        <div role="alert">
          <p>{error || s.error}</p>
          {canRetry && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void mutate(attempt.current!.action)}
            >
              Coba lagi permintaan yang sama
            </button>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {confirm && (
        <AdminFloatingWindow
          title="Hapus foto profil?"
          busy={busy}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Foto aktif akan dihapus dan diganti inisial. Salinan backup
            mengikuti retensi backup terpisah.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="avatar-confirm-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void mutate("delete")}
            >
              Ya, hapus foto
            </button>
          </div>
        </AdminFloatingWindow>
      )}
    </section>
  );
}
