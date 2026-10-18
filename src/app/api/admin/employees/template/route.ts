import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { EMPLOYEE_IMPORT_HEADERS } from "@/application/employees/import-service";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";
import { templateWorkbook } from "@/infrastructure/spreadsheet/workbook";
export function createEmployeeTemplateHandler(factory = createEmployeeRuntime) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      if (new URL(request.url).search)
        return Response.json(
          { error: "Parameter template tidak dikenal." },
          { status: 422 },
        );
      return new Response(
        Buffer.from(
          templateWorkbook([[...EMPLOYEE_IMPORT_HEADERS]], "Pegawai", [
            "PETUNJUK IMPOR PEGAWAI SI CUTI",
            "Isi worksheet pertama Pegawai. Kelima kolom wajib; jangan mengubah urutan/header atau menambah kolom.",
            "NIP: teks, maksimal 32 karakter. Pertahankan format Teks sebelum mengetik/menempel digit panjang atau awalan nol. Jangan memakai formula.",
            "Nama Lengkap, Jabatan, Unit Kerja: teks, masing-masing maksimal 200 karakter.",
            "Status Aktif: TRUE/AKTIF atau FALSE/TIDAK AKTIF. Baris seluruhnya kosong diabaikan.",
            "Maksimal 500 pegawai dan unggahan 2 MB termasuk formulir. Atasan diatur melalui edit satuan, bukan impor ini.",
            "Pratinjau belum menyimpan. Konfirmasi menyimpan seluruh baris valid secara atomik; satu kesalahan membatalkan seluruh impor.",
            "NIP existing/duplikat ditolak. Tidak menimpa/mengaktifkan data existing, membuat akun, kata sandi, role atau saldo.",
            "Template ini kosong tanpa contoh pegawai. Worksheet Petunjuk bukan data impor.",
          ]),
        ),
        {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition":
              'attachment; filename="template-pegawai.xlsx"',
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    } catch (error) {
      return (
        authorizationResponse(error) ??
        Response.json(
          { error: "Template pegawai gagal dibuat." },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
export const GET = createEmployeeTemplateHandler();
