package dbstore

import (
	"context"
)

// Service merepresentasikan bidang layanan di tabel ptsp_services.
type Service struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// ServiceItem merepresentasikan item/jenis permohonan di tabel ptsp_service_items.
type ServiceItem struct {
	ID        int    `json:"id"`
	ServiceID int    `json:"service_id"`
	Name      string `json:"name"`
}

// ServiceRequirement merepresentasikan persyaratan dokumen di tabel ptsp_service_requirements.
type ServiceRequirement struct {
	ID            int    `json:"id"`
	ServiceItemID int    `json:"service_item_id"`
	DocumentName  string `json:"document_name"`
	Description   string `json:"description"`
	IsRequired    bool   `json:"is_required"`
}

// ServiceStore menangani query dinamis langsung ke skema PTSP (kemenag_ptsp).
type ServiceStore struct {
	store *Store
}

// ListActiveServices mengambil seluruh bidang layanan aktif langsung dari database.
func (s *ServiceStore) ListActiveServices(ctx context.Context) ([]Service, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, name, is_active
		 FROM `+s.store.qOutbox("ptsp_services")+`
		 WHERE is_active = true
		 ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Service
	for rows.Next() {
		var srv Service
		if err := rows.Scan(&srv.ID, &srv.Name, &srv.IsActive); err != nil {
			return nil, err
		}
		out = append(out, srv)
	}
	return out, rows.Err()
}

// ListItemsByServiceID mengambil seluruh item permohonan untuk satu bidang layanan.
func (s *ServiceStore) ListItemsByServiceID(ctx context.Context, serviceID int) ([]ServiceItem, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, service_id, name
		 FROM `+s.store.qOutbox("ptsp_service_items")+`
		 WHERE service_id = $1
		 ORDER BY id ASC`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ServiceItem
	for rows.Next() {
		var it ServiceItem
		if err := rows.Scan(&it.ID, &it.ServiceID, &it.Name); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ListRequirementsByItemID mengambil daftar syarat berkas dokumen untuk satu jenis permohonan.
func (s *ServiceStore) ListRequirementsByItemID(ctx context.Context, itemID int) ([]ServiceRequirement, error) {
	rows, err := s.store.Query(ctx,
		`SELECT id, service_item_id, document_name, COALESCE(description, ''), is_required
		 FROM `+s.store.qOutbox("ptsp_service_requirements")+`
		 WHERE service_item_id = $1
		 ORDER BY sort_order ASC, id ASC`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ServiceRequirement
	for rows.Next() {
		var r ServiceRequirement
		if err := rows.Scan(&r.ID, &r.ServiceItemID, &r.DocumentName, &r.Description, &r.IsRequired); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
