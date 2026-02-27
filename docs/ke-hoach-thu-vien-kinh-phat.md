# 📿 Kế Hoạch Dự Án: Thư Viện Kinh Phật Thông Minh

> **Mục tiêu:** Xây dựng hệ thống thư viện kinh Phật trực tuyến, tích hợp AI để người dùng có thể tra cứu, tìm hiểu giáo pháp qua giao diện hội thoại tự nhiên.

---

## 🗺️ Tổng Quan Dự Án

| Hạng mục | Chi tiết |
|---|---|
| **Tên dự án** | Thư Viện Kinh Phật Thông Minh |
| **Ngôn ngữ chính** | Tiếng Việt |
| **Công nghệ cốt lõi** | Python (Crawler) · React/HTML (Frontend) · Claude API (LLM) |
| **Số phase** | 2 phase chính + 1 phase mở rộng |
| **Ước tính thời gian** | 4–6 tuần |

---

## 📦 Phase 1 — Crawl & Xây Dựng Kho Dữ Liệu

**Mục tiêu:** Thu thập và chuẩn hóa toàn bộ kinh văn từ các nguồn uy tín, lưu trữ dưới dạng có cấu trúc để phục vụ tra cứu.

### 1.1 Xác Định Nguồn Dữ Liệu

| Nguồn | URL | Nội dung |
|---|---|---|
| Thư Viện Hoa Sen | thuvienhoasen.org | Kinh, Luật, Luận đầy đủ |
| Chuabaphung.vn | chuabaphung.vn | Kinh tụng hằng ngày |
| Budsas.org | budsas.org | Kinh tạng Nikaya (Pali) |
| Dhammadownload.com | dhammadownload.com | Tam tạng song ngữ |

### 1.2 Cấu Trúc Dữ Liệu

Mỗi bản kinh được lưu với schema sau:

```json
{
  "id": "string",
  "title": "Tên kinh (tiếng Việt)",
  "title_pali": "Tên Pali (nếu có)",
  "title_sanskrit": "Tên Sanskrit (nếu có)",
  "category": "Nikaya | Đại Thừa | Mật Tông | Thiền | Tịnh Độ",
  "subcategory": "Trường Bộ | Trung Bộ | ...",
  "source": "Tên nguồn",
  "url": "URL gốc",
  "author_translator": "Người dịch",
  "summary": "Tóm tắt ngắn (~200 từ)",
  "content": "Nội dung đầy đủ",
  "key_concepts": ["niết bàn", "vô thường", "bát chánh đạo"],
  "tags": ["tag1", "tag2"],
  "related_suttas": ["id1", "id2"],
  "created_at": "ISO8601"
}
```

### 1.3 Phân Loại Kinh Điển

```
📚 Thư Viện
├── 🔵 Phật Giáo Nguyên Thủy (Theravāda)
│   ├── Trường Bộ Kinh (Dīgha Nikāya)
│   ├── Trung Bộ Kinh (Majjhima Nikāya)
│   ├── Tương Ưng Bộ Kinh (Saṃyutta Nikāya)
│   ├── Tăng Chi Bộ Kinh (Aṅguttara Nikāya)
│   └── Tiểu Bộ Kinh (Khuddaka Nikāya)
├── 🔴 Phật Giáo Đại Thừa (Mahāyāna)
│   ├── Bát Nhã (Prajñāpāramitā)
│   ├── Hoa Nghiêm (Avataṃsaka)
│   ├── Pháp Hoa (Saddharmapuṇḍarīka)
│   ├── Niết Bàn (Mahāparinirvāṇa)
│   └── Tịnh Độ (A Di Đà, Vô Lượng Thọ)
├── 🟡 Thiền Tông
│   ├── Kinh Lăng Già
│   ├── Kinh Kim Cương
│   └── Pháp Bảo Đàn Kinh
└── 🟣 Mật Tông (Vajrayāna)
    ├── Đại Nhật Kinh
    └── Kim Cương Đỉnh Kinh
```

### 1.4 Công Nghệ & Công Cụ Crawl

- **Crawler:** `requests` + `BeautifulSoup4`
- **Async crawl:** `aiohttp` + `asyncio` (tăng tốc)
- **Rate limiting:** 1–2 giây/request (tôn trọng server)
- **Storage:**
  - Raw: JSON files theo từng kinh
  - Index: SQLite hoặc JSON index tổng hợp
  - Vector DB: ChromaDB (cho semantic search)
- **Embedding:** `sentence-transformers` (mô hình đa ngữ)

### 1.5 Quy Trình Crawl

```
[URL seed] 
    → Crawl danh mục 
    → Extract danh sách kinh
    → Crawl từng bản kinh
    → Parse & chuẩn hóa
    → Lọc trùng lặp
    → Tạo embeddings
    → Lưu vào DB
    → Tạo index tìm kiếm
```

### 1.6 Deliverables Phase 1

- [ ] `crawler.py` — Script crawl đa nguồn
- [ ] `parser.py` — Chuẩn hóa và làm sạch dữ liệu
- [ ] `embeddings.py` — Tạo vector embeddings
- [ ] `data/suttas/*.json` — Kho kinh văn thô
- [ ] `data/index.json` — Index tổng hợp
- [ ] `data/chroma_db/` — Vector database

---

## 💬 Phase 2 — Giao Diện Chat Thông Minh

**Mục tiêu:** Xây dựng giao diện hội thoại đẹp, cho phép người dùng hỏi về kinh Phật theo ngôn ngữ tự nhiên.

### 2.1 Kiến Trúc Hệ Thống

```
┌─────────────────────────────────┐
│         Người Dùng              │
│    (Giao diện Chat - Browser)   │
└──────────────┬──────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────┐
│         Frontend (React)        │
│  - Chat UI                      │
│  - Tìm kiếm                     │
│  - Đọc kinh                     │
└──────────────┬──────────────────┘
               │ API calls
┌──────────────▼──────────────────┐
│         Backend (FastAPI)       │
│  - /chat endpoint               │
│  - /search endpoint             │
│  - /sutra/:id endpoint          │
└──────┬───────────────┬──────────┘
       │               │
┌──────▼──────┐  ┌─────▼────────┐
│  Claude API │  │  Vector DB   │
│  (LLM)      │  │  (ChromaDB)  │
└─────────────┘  └─────┬────────┘
                       │
                ┌──────▼────────┐
                │  Kho Kinh Văn │
                │  (JSON/SQLite)│
                └───────────────┘
```

### 2.2 Tính Năng Chat AI

| Tính năng | Mô tả |
|---|---|
| **Tra cứu kinh** | "Cho tôi xem kinh Tâm Kinh" |
| **Giải thích khái niệm** | "Vô thường nghĩa là gì?" |
| **So sánh** | "Sự khác nhau giữa Thiền Tông và Tịnh Độ?" |
| **Tóm tắt** | "Tóm tắt nội dung chính của kinh Pháp Hoa" |
| **Tìm đoạn kinh** | "Tìm đoạn kinh nói về lòng từ bi" |
| **Gợi ý học** | "Tôi mới bắt đầu, nên đọc kinh nào?" |
| **Ngữ cảnh hóa** | "Phật dạy gì về sự đau khổ?" |

### 2.3 System Prompt cho AI

AI được cấu hình như một vị thầy Phật pháp:
- Trả lời bằng tiếng Việt, ngôn từ trang nhã
- Trích dẫn chính xác từ kinh điển trong DB
- Giải thích theo nhiều cấp độ (người mới / tu học lâu năm)
- Không áp đặt giáo phái, tôn trọng mọi truyền thống
- Khuyến khích thực hành, không chỉ lý thuyết

### 2.4 Thiết Kế UI/UX

**Màu sắc & Phong cách:**
- Tông màu chủ đạo: vàng đất (#C8883A), nâu trầm (#3D2B1F), kem (#F5EDD6)
- Font chữ: Serif cổ điển cho kinh văn, Sans-serif cho chat
- Hình nền: hoa sen mờ nhẹ, texture giấy xưa

**Bố cục:**
```
┌─────────────────────────────────────────┐
│  🪷 Thư Viện Kinh Phật    [Tìm kiếm 🔍] │
├──────────────┬──────────────────────────┤
│              │                          │
│  Danh mục   │   Cửa sổ Chat            │
│  Kinh Điển  │                          │
│             │  [Tin nhắn người dùng]   │
│  • Nikaya   │  [Phản hồi AI + trích    │
│  • Đại Thừa │   dẫn kinh điển]         │
│  • Thiền    │                          │
│  • Mật Tông │  ─────────────────────   │
│             │  [Gõ câu hỏi của bạn...] │
│  Kinh nổi  │  [       Gửi 🙏         ] │
│  bật hôm   │                          │
│  nay        │                          │
└──────────────┴──────────────────────────┘
```

### 2.5 Tính Năng Bổ Sung

- 🔍 **Tìm kiếm ngữ nghĩa** — Tìm theo ý nghĩa, không chỉ từ khóa
- 📖 **Chế độ đọc kinh** — Giao diện tối giản, font lớn, không phân tâm
- 🔖 **Đánh dấu & ghi chú** — Lưu đoạn kinh yêu thích
- 🌐 **Song ngữ** — Hiển thị bản Pali/Sanskrit song song
- 🔊 **Text-to-speech** — Nghe đọc kinh
- 📤 **Chia sẻ** — Copy link đến đoạn kinh cụ thể
- 📱 **Responsive** — Dùng được trên điện thoại

### 2.6 Tech Stack Frontend

```
React 18
├── Styling: Tailwind CSS + CSS Variables
├── Chat: Custom hook + fetch/SSE streaming
├── Search: Debounced input → API
├── State: useState / useContext
└── Icons: Lucide React
```

### 2.7 Deliverables Phase 2

- [ ] `backend/main.py` — FastAPI server
- [ ] `backend/rag.py` — Retrieval-Augmented Generation logic
- [ ] `frontend/src/App.jsx` — Main React app
- [ ] `frontend/src/components/Chat.jsx`
- [ ] `frontend/src/components/Library.jsx`
- [ ] `frontend/src/components/SutraReader.jsx`
- [ ] `docker-compose.yml` — Deploy toàn bộ stack

---

## 🚀 Phase 3 (Mở Rộng) — Tính Năng Nâng Cao

| Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|
| Người dùng & tài khoản | Đăng ký, lưu lịch sử, ghi chú cá nhân | Cao |
| Lộ trình học tập | AI đề xuất lộ trình học kinh theo mục tiêu | Cao |
| Chú thích cộng đồng | Người dùng thêm chú thích, thảo luận | Trung |
| Mobile App | React Native hoặc PWA | Trung |
| Đa ngôn ngữ | English, Khmer, Thai, Chinese | Thấp |
| API công khai | Cho phép bên thứ ba tích hợp | Thấp |

---

## 📅 Timeline Ước Tính

```
Tuần 1–2:   Phase 1 — Crawl & xây dựng dataset
Tuần 3:     Phase 1 — Embeddings & vector DB
Tuần 4:     Phase 2 — Backend API + RAG pipeline
Tuần 5:     Phase 2 — Frontend UI + chat interface
Tuần 6:     Testing, tối ưu, deploy
```

---

## ⚠️ Lưu Ý Kỹ Thuật & Pháp Lý

- **Bản quyền:** Ưu tiên crawl các nguồn mở, kinh điển cổ (public domain). Xin phép nếu crawl bản dịch hiện đại.
- **Rate limiting:** Tuân thủ `robots.txt`, đặt delay giữa các request.
- **Chất lượng dữ liệu:** Kiểm tra thủ công mẫu ngẫu nhiên sau khi crawl.
- **Hallucination:** AI phải trích dẫn từ DB thực, không tự chế kinh văn.
- **Caching:** Cache kết quả phổ biến để giảm API calls.

---

## 📌 Bước Tiếp Theo Ngay

1. **Xác nhận kế hoạch** với các bên liên quan
2. **Chọn nguồn crawl ưu tiên** (đề xuất: Thư Viện Hoa Sen trước)
3. **Thiết lập môi trường** dev (Python venv, Node.js)
4. **Viết crawler prototype** cho 1 nguồn
5. **Test giao diện chat** với dữ liệu mẫu

---

*🙏 "Kinh Phật là ngọn đèn soi sáng con đường giải thoát — hãy để công nghệ giúp ánh sáng đó đến được với nhiều người hơn."*
