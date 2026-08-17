/**
 * Utility hàm sắp xếp danh sách học sinh theo thứ tự bảng chữ cái Tiếng Việt (Tên -> Họ và Tên đệm)
 */

export function compareVietnameseNames(nameA: string = '', nameB: string = ''): number {
  const getParts = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { firstName: '', lastName: '' };
    const parts = trimmed.split(/\s+/);
    const firstName = parts[parts.length - 1] || '';
    const lastName = parts.slice(0, parts.length - 1).join(' ');
    return { firstName, lastName };
  };

  const pA = getParts(nameA);
  const pB = getParts(nameB);

  // 1. So sánh Tên chính (ví dụ "Anh", "Bảo", "Linh", "Nam")
  const cmpFirstName = pA.firstName.localeCompare(pB.firstName, 'vi', { sensitivity: 'base' });
  if (cmpFirstName !== 0) return cmpFirstName;

  // 2. Nếu trùng Tên chính, so sánh Họ & Tên đệm (ví dụ "Nguyễn Đức" vs "Nguyễn Minh")
  return pA.lastName.localeCompare(pB.lastName, 'vi', { sensitivity: 'base' });
}

export function sortStudentsByName<T extends Record<string, any>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const nameA = a?.full_name || a?.student_name || a?.name || '';
    const nameB = b?.full_name || b?.student_name || b?.name || '';
    return compareVietnameseNames(nameA, nameB);
  });
}
