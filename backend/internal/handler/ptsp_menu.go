package handler

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/kemenag/ptsp-wa-bot/backend/internal/anti_ban"
	"github.com/kemenag/ptsp-wa-bot/backend/internal/dbstore"
)

var numberEmojis = []string{"1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"}

// IsMenuTrigger memeriksa apakah teks adalah kata pembuka menu utama.
func IsMenuTrigger(norm string) bool {
	switch norm {
	case "menu", "layanan", "ptsp", "halo", "hai", "bantuan", "info", "assalamualaikum", "assalamu'alaikum", "p", "start":
		return true
	}
	return false
}

// HandleDynamicPTSPMenu memproses pesan masuk dan mencocokkannya dengan data layanan
// yang diambil langsung secara dinamis dari database (kemenag_ptsp.ptsp_services).
// Mengembalikan (response, isHandled, shouldMuteBot).
func HandleDynamicPTSPMenu(ctx context.Context, store *dbstore.Store, rawText string, senderJID string, contactName string) (*string, bool, bool) {
	norm := strings.TrimSpace(strings.ToLower(rawText))
	if norm == "" {
		return nil, false, false
	}

	nameDisplay := strings.TrimSpace(contactName)
	if nameDisplay == "" || strings.ToLower(nameDisplay) == "unknown" || anti_ban.IsPhoneNumber(nameDisplay) {
		nameDisplay = "Bapak/Ibu"
	}

	// 1. Permintaan Bantuan Petugas Manual (0 atau "petugas" atau "cs")
	if norm == "0" || norm == "petugas" || norm == "cs" || norm == "admin" || norm == "operator" {
		msg := anti_ban.SpintaxAndSign(fmt.Sprintf(
			"👨‍💼 *Permintaan Terhubung dengan Petugas PTSP*\n\n"+
				"Pesan Anda telah kami tandai untuk petugas loket PTSP Kantor Kementerian Agama Kabupaten Barito Utara.\n\n"+
				"Petugas kami akan segera membalas percakapan Anda secara langsung di sini pada jam kerja.\n\n"+
				"Mohon menunggu ya %s. Terima kasih atas kesabarannya. 🙏\n\n"+
				"_Ketik *MENU* kapan saja jika ingin melihat daftar persyaratan otomatis kembali._",
			nameDisplay,
		))
		return &msg, true, true
	}

	// 2. Menu Utama (Dinamis dari database ptsp_services)
	if IsMenuTrigger(norm) {
		services, err := store.Services.ListActiveServices(ctx)
		if err != nil || len(services) == 0 {
			// Fallback ke auto_replies jika ptsp_services kosong/error
			return nil, false, false
		}

		var sb strings.Builder
		sb.WriteString("🏢 *Selamat Datang di PTSP Kemenag Barito Utara*\n")
		sb.WriteString(fmt.Sprintf("Halo %s, silakan balas dengan mengetik *NOMOR* layanan bidang di bawah ini:\n\n", nameDisplay))

		for i, srv := range services {
			if i < len(numberEmojis) {
				sb.WriteString(fmt.Sprintf("%s %s\n", numberEmojis[i], srv.Name))
			} else {
				sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, srv.Name))
			}
		}

		sb.WriteString("0️⃣ Hubungkan ke Petugas PTSP\n\n")
		sb.WriteString("_Ketik angka pilihan (contoh: *1*) atau ketik *MENU* kapan saja._")

		res := anti_ban.SpintaxAndSign(sb.String())
		return &res, true, false
	}

	// 3. Pilihan Nomor Layanan Bidang (contoh: "1", "2", "3")
	if num, err := strconv.Atoi(norm); err == nil && num >= 1 && num <= 30 {
		services, err := store.Services.ListActiveServices(ctx)
		if err == nil && num <= len(services) {
			selectedSrv := services[num-1]

			// Ambil items untuk service ini
			items, err := store.Services.ListItemsByServiceID(ctx, selectedSrv.ID)
			if err == nil && len(items) > 0 {
				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("📁 *%s*\n\n", selectedSrv.Name))
				sb.WriteString("Silakan balas dengan mengetik *KODE* jenis permohonan untuk melihat persyaratan berkas:\n\n")

				for i, it := range items {
					code := fmt.Sprintf("%d%c", num, 'a'+i)
					sb.WriteString(fmt.Sprintf("• *%s* : %s\n", code, it.Name))
				}

				sb.WriteString("\n_Ketik kode (contoh: *")
				sb.WriteString(fmt.Sprintf("%da", num))
				sb.WriteString("*) atau ketik *MENU* untuk kembali ke menu utama._")

				res := anti_ban.SpintaxAndSign(sb.String())
				return &res, true, false
			}
		}
	}

	// 4. Pilihan Kode Item (contoh: "1a", "1b", "2a", "2b")
	// Cek apakah ada format angka + huruf (misal: len >= 2)
	if len(norm) >= 2 && norm[0] >= '1' && norm[0] <= '9' && norm[1] >= 'a' && norm[1] <= 'z' {
		// Prioritas 1: Jika di tabel wa_auto_replies sudah ada respon custom khusus untuk kode ini
		if customResp, _ := store.AutoReplies.Match(ctx, norm); customResp != nil && strings.TrimSpace(*customResp) != "" {
			res := anti_ban.SpintaxAndSign(*customResp)
			return &res, true, false
		}

		// Prioritas 2: Ambil dinamis dari database ptsp_service_items & ptsp_service_requirements
		srvNum, _ := strconv.Atoi(string(norm[0]))
		charIndex := int(norm[1] - 'a')

		services, err := store.Services.ListActiveServices(ctx)
		if err == nil && srvNum >= 1 && srvNum <= len(services) {
			selectedSrv := services[srvNum-1]
			items, err := store.Services.ListItemsByServiceID(ctx, selectedSrv.ID)
			if err == nil && charIndex >= 0 && charIndex < len(items) {
				selectedItem := items[charIndex]
				reqs, err := store.Services.ListRequirementsByItemID(ctx, selectedItem.ID)

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("📄 *Syarat & Ketentuan Layanan:*\n*%s*\n\n", selectedItem.Name))

				if err == nil && len(reqs) > 0 {
					sb.WriteString("📋 *Daftar Dokumen Persyaratan:*\n")
					for idx, r := range reqs {
						wajib := "Wajib"
						if !r.IsRequired {
							wajib = "Opsional"
						}
						sb.WriteString(fmt.Sprintf("%d. *%s* (%s)\n", idx+1, r.DocumentName, wajib))
						if r.Description != "" {
							sb.WriteString(fmt.Sprintf("   _%s_\n", r.Description))
						}
					}
				} else {
					sb.WriteString("Untuk informasi persyaratan lengkap layanan ini, Anda dapat mengajukan langsung ke loket PTSP Kantor Kemenag Barito Utara pada jam operasional.\n")
				}

				sb.WriteString("\n_Ketik *MENU* untuk kembali ke menu utama atau ketik *0* untuk bantuan petugas._")
				res := anti_ban.SpintaxAndSign(sb.String())
				return &res, true, false
			}
		}
	}

	return nil, false, false
}
