/**
 * Centralized copy for offline-related UI (error pages, banner, settings).
 * Vietnamese; single source for consistency and future i18n.
 */
export const OFFLINE_COPY = {
  /** Catalog (Library/Category) error when offline and no cache */
  catalogOfflineTitle: 'Bạn đang ngoại tuyến',
  catalogOfflineDescription:
    'Kết nối mạng để tải thư viện. Hoặc mở sách từ Trang chủ / Dấu trang nếu bạn đã đọc trước đó.',

  /** Reader: book not in cache — connect and open once to read offline later */
  readerOfflineGuidance:
    'Sách này chưa có trong bộ nhớ đệm. Hãy kết nối mạng, mở sách một lần, sau đó bạn có thể đọc offline.',

  /** OfflineBanner: short hint under main message */
  bannerHint: 'Kết nối mạng để tải nội dung mới; sách đã mở vẫn đọc được.',

  /** Settings > Offline storage: explanation line */
  settingsExplanation: 'Danh mục và các sách đã mở được lưu để đọc offline.',
} as const
