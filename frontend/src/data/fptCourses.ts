// Danh mục môn học Đại học FPT (mã môn + tên môn chính thức) để chọn nhanh khi thêm môn.
// Nguồn: bảng môn học do người dùng cung cấp (24/10/2026). Giữ nguyên mã và chữ hoa / thường như bảng gốc
// (vd MKT208c, DMA301m: hậu tố c / m là biến thể của môn). nameVi chỉ có khi bảng gốc có tên tiếng Việt.
// Thêm môn: thêm 1 dòng, giữ thứ tự theo mã. Người dùng vẫn sửa được mã / tên sau khi chọn.

export interface CatalogCourse {
  /** Mã môn (2–20 ký tự: chữ, số, _ , -) */
  code: string
  /** Tên tiếng Anh (tên chính thức trên FAP) */
  name: string
  /** Tên tiếng Việt (nếu có) */
  nameVi?: string
}

export const FPT_COURSES: CatalogCourse[] = [
  { code: 'ACD301', name: 'Analog Circuit Design', nameVi: 'Thiết kế vi mạch tương tự' },
  { code: 'ACH301', name: 'Accomodation management', nameVi: 'Thực hành quản lý lưu trú' },
  { code: 'ACL201', name: 'The Law of ASEAN Community', nameVi: 'Pháp luật cộng đồng ASEAN' },
  { code: 'ACM001', name: 'OLP & ACM_ICPC training' },
  { code: 'ACS201', name: 'Automotive Communication Systems', nameVi: 'Hệ thống truyền thông trong ô tô' },
  { code: 'BF_GRA_ELE', name: 'Digital Banking - Finance Graduation Thesis Elective', nameVi: 'Ngân hàng số - Luận văn tốt nghiệp chuyên ngành Tài chính' },
  { code: 'BFC301', name: 'Credit analysis and loan management', nameVi: 'Quản lý tín dụng và khoản vay' },
  { code: 'BFD301', name: 'Digital Banking', nameVi: 'Ngân hàng số' },
  { code: 'BFL301', name: 'Law of Banking & Finance', nameVi: 'Luật Tài chính - Ngân hàng' },
  { code: 'BFT201', name: 'Applications of Technology in Digital Banking and Finance', nameVi: 'Ứng dụng công nghệ trong Ngân hàng số - tài chính' },
  { code: 'CHN113', name: 'Elementary Chinese 1' },
  { code: 'CHN123', name: 'Elementary Chinese 2' },
  { code: 'DMA301m', name: 'Digital Marketing Analytics' },
  { code: 'DTG111', name: 'Visual Design Tools 1' },
  { code: 'MAS202', name: 'Applied Statistics for business' },
  { code: 'MKT202', name: 'Service Marketing Management' },
  { code: 'MKT208c', name: 'Social media marketing' },
  { code: 'SAL301', name: 'Professional Selling and Management' },
  { code: 'SSB201', name: 'Advanced Business Communication' },
]
