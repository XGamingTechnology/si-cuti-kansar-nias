"use client";
import { useState } from "react";
import { AdminFloatingWindow } from "./admin-floating-window";
import { useDashboardJSON } from "./use-dashboard-json";
import type {
  OverlayInput,
  OverlayVersion,
} from "@/application/dashboard/overlay";
type Preview = {
  data: OverlayInput;
  expectedVersion: number;
  fingerprint: string;
  diff: {
    added: OverlayInput["events"];
    removed: OverlayInput["events"];
    changed: OverlayInput["events"];
  };
};
export function CalendarOverlayAdmin({
  year,
  onClose,
  onPublished,
}: {
  year: number;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [data, setData] = useState<OverlayInput>({
    year,
    sourceReference: "",
    sourcePublishedOn: "",
    sourceUrl: "",
    events: [{ date: "", name: "", category: "PUBLIC_HOLIDAY" }],
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<OverlayVersion | null>(
    null,
  );
  const history = useDashboardJSON<{
    versions: OverlayVersion[];
    nextBefore: number | null;
  }>(
    `/api/admin/calendar-overlays?year=${year}${before ? `&before=${before}` : ""}`,
  );
  function change(next: OverlayInput) {
    setData(next);
    setPreview(null);
    setConfirmed(false);
    setConflict(false);
    setKey("");
    setMessage("");
  }
  async function run(publish: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/calendar-overlays/${publish ? "publish" : "preview"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            publish
              ? { ...preview, idempotencyKey: key, confirmed, diff: undefined }
              : data,
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(result.error ?? "Overlay gagal diproses.");
      }
      if (publish) {
        setPreview(null);
        setConfirmed(false);
        setBefore(null);
        history.reload();
        onPublished();
        setMessage(
          `Versi ${result.version.version} berhasil diterbitkan. Transaksi cuti dan saldo tidak berubah.`,
        );
      } else {
        setPreview(result);
        setKey(crypto.randomUUID());
        setConfirmed(false);
        setConflict(false);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Koneksi gagal. Ulangi publikasi dengan kunci retry yang sama.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setMessage("");
    if (file.size > 300000) {
      setMessage("File JSON maksimal 300 KB.");
      return;
    }
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("events" in parsed) ||
        !Array.isArray(parsed.events) ||
        parsed.events.length > 500
      )
        throw new Error(); // server remains authoritative
      // Keep untrusted file out of editable controls until server validates every field.
      const response = await fetch("/api/admin/calendar-overlays/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "File tidak valid.");
      if (result.data.year !== year)
        throw new Error(
          "Tahun file harus sama dengan tahun kalender yang dipilih.",
        );
      setData(result.data);
      setPreview(null);
      setConfirmed(false);
      setConflict(false);
      setKey("");
      setMessage(
        "File dimuat dan divalidasi. Periksa sumber lalu buat pratinjau untuk publikasi.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "Format JSON tidak valid.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title={`Overlay resmi tahun ${year}`}
      onClose={onClose}
      busy={busy}
    >
      <div className="m6-overlay-admin">
        <p>
          Input/import berdasarkan dokumen resmi. Tidak ada konektor atau
          sinkronisasi pemerintah otomatis. Jangan masukkan data contoh sebagai
          kalender resmi.
        </p>
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
        {conflict && (
          <p role="alert">
            Versi telah berubah atau data tidak cocok. Kembali ke formulir dan
            buat pratinjau ulang; data lama tidak ditimpa.
          </p>
        )}
        {!preview ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(false);
            }}
          >
            <fieldset disabled={busy}>
              <legend>Sumber dan tanggal resmi</legend>
              <label>
                Referensi dokumen/SK resmi
                <input
                  required
                  maxLength={500}
                  value={data.sourceReference}
                  onChange={(e) =>
                    change({ ...data, sourceReference: e.target.value })
                  }
                />
              </label>
              <label>
                Tanggal dokumen
                <input
                  required
                  type="date"
                  value={data.sourcePublishedOn}
                  onChange={(e) =>
                    change({ ...data, sourcePublishedOn: e.target.value })
                  }
                />
              </label>
              <label>
                URL sumber pemerintah (opsional, HTTPS .go.id)
                <input
                  type="url"
                  maxLength={1000}
                  value={data.sourceUrl}
                  onChange={(e) =>
                    change({ ...data, sourceUrl: e.target.value })
                  }
                />
              </label>
              <label>
                Impor JSON resmi tervalidasi
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </label>
              <details>
                <summary>Format JSON yang didukung</summary>
                <p>
                  Objek berisi year, sourceReference, sourcePublishedOn
                  (YYYY-MM-DD), sourceUrl (boleh kosong), events. Setiap event
                  berisi date (YYYY-MM-DD), name, category (PUBLIC_HOLIDAY atau
                  JOINT_LEAVE). Maksimal 500 event; tanggal harus sesuai tahun.
                  Tidak ada parser PDF.
                </p>
              </details>
              {data.events.map((event, index) => (
                <div className="m6-event-editor" key={index}>
                  <label>
                    Tanggal {index + 1}
                    <input
                      required
                      type="date"
                      value={event.date}
                      min={`${year}-01-01`}
                      max={`${year}-12-31`}
                      onChange={(e) =>
                        change({
                          ...data,
                          events: data.events.map((v, i) =>
                            i === index ? { ...v, date: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Nama {index + 1}
                    <input
                      required
                      maxLength={200}
                      value={event.name}
                      onChange={(e) =>
                        change({
                          ...data,
                          events: data.events.map((v, i) =>
                            i === index ? { ...v, name: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Kategori {index + 1}
                    <select
                      value={event.category}
                      onChange={(e) =>
                        change({
                          ...data,
                          events: data.events.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  category: e.target
                                    .value as typeof event.category,
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="PUBLIC_HOLIDAY">Libur Nasional</option>
                      <option value="JOINT_LEAVE">Cuti Bersama</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={data.events.length === 1}
                    onClick={() =>
                      change({
                        ...data,
                        events: data.events.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Hapus baris
                  </button>
                </div>
              ))}
              <div className="floating-form-actions">
                <button
                  type="button"
                  disabled={data.events.length >= 500}
                  onClick={() =>
                    change({
                      ...data,
                      events: [
                        ...data.events,
                        { date: "", name: "", category: "PUBLIC_HOLIDAY" },
                      ],
                    })
                  }
                >
                  Tambah tanggal
                </button>
                <button className="primary-button" type="submit">
                  {busy ? "Memvalidasi…" : "Pratinjau overlay"}
                </button>
              </div>
            </fieldset>
          </form>
        ) : (
          <section aria-label="Pratinjau overlay">
            <h3>Pratinjau versi {preview.expectedVersion + 1}</h3>
            <p>
              {preview.data.sourceReference} · {preview.data.sourcePublishedOn}{" "}
              · {preview.data.events.length} event
            </p>
            <p>
              Ditambah {preview.diff.added.length} · Dihapus{" "}
              {preview.diff.removed.length} · Nama berubah{" "}
              {preview.diff.changed.length}. Publikasi menggantikan seluruh
              dataset tahun ini, bukan menambahkan baris saja.
            </p>
            <ul>
              {preview.data.events.map((e) => (
                <li key={`${e.date}-${e.category}`}>
                  {e.date} ·{" "}
                  {e.category === "PUBLIC_HOLIDAY"
                    ? "Libur Nasional"
                    : "Cuti Bersama"}{" "}
                  · {e.name}
                </li>
              ))}
            </ul>
            {preview.diff.removed.length > 0 && (
              <>
                <h4>Tanggal dihapus dari versi aktif</h4>
                <ul>
                  {preview.diff.removed.map((e) => (
                    <li key={`${e.date}-${e.category}`}>
                      {e.date} · {e.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <label className="m6-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || conflict}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Saya telah memverifikasi data terhadap dokumen resmi dan
              mengonfirmasi publikasi overlay tampilan saja.
            </label>
            <div className="floating-form-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setConfirmed(false);
                  setConflict(false);
                }}
              >
                Kembali ke formulir
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!confirmed || busy || conflict}
                onClick={() => void run(true)}
              >
                {busy ? "Menerbitkan…" : "Terbitkan overlay"}
              </button>
            </div>
          </section>
        )}
        <section aria-label="Riwayat versi overlay">
          <h3>Riwayat publikasi — {year}</h3>
          {history.loading ? (
            <p role="status">Memuat riwayat…</p>
          ) : history.error ? (
            <p role="alert">
              {history.error}
              <button type="button" onClick={history.reload}>
                Coba lagi
              </button>
            </p>
          ) : !history.data?.versions.length ? (
            <p>Belum ada versi diterbitkan.</p>
          ) : (
            history.data.versions.map((v) => (
              <article key={v.id}>
                <strong>Versi {v.version}</strong>
                <p>
                  {v.sourceReference} ·{" "}
                  {new Date(v.publishedAt).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}{" "}
                  WIB
                </p>
                <p>Aktor (ID pengguna): {v.actorUserId}</p>
                <p>Checksum: {v.checksum}</p>
                <button type="button" onClick={() => setSelectedVersion(v)}>
                  Lihat versi {v.version}
                </button>
              </article>
            ))
          )}
          {history.data?.nextBefore && (
            <button
              type="button"
              onClick={() => setBefore(history.data!.nextBefore)}
            >
              Versi lebih lama
            </button>
          )}
          {before && (
            <button type="button" onClick={() => setBefore(null)}>
              Versi terbaru
            </button>
          )}
          {selectedVersion && (
            <section aria-label="Isi versi historis">
              <h4>Isi versi {selectedVersion.version}</h4>
              <p>
                {selectedVersion.sourceReference} · Tanggal dokumen{" "}
                {selectedVersion.sourcePublishedOn}
              </p>
              <ul>
                {selectedVersion.events.map((e) => (
                  <li key={`${e.date}-${e.category}`}>
                    {e.date} ·{" "}
                    {e.category === "PUBLIC_HOLIDAY"
                      ? "Libur Nasional"
                      : "Cuti Bersama"}{" "}
                    · {e.name}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSelectedVersion(null)}>
                Tutup isi versi
              </button>
            </section>
          )}
        </section>
      </div>
    </AdminFloatingWindow>
  );
}
