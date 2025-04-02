# VMTea Automation

Một công cụ Node.js để tự động hóa việc chuyển token TEA.

## Yêu cầu

- Node.js (phiên bản 16 hoặc cao hơn)
- Docker (tùy chọn, để chạy trong môi trường container)

## Cài đặt

1. Clone repository:
   ```bash
   git clone <repository-url>
   cd VMTea
   ```

2. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```

## Cấu hình

1. Đổi tên file `privatekey.example.txt` thành `privatekey.txt` và thêm các private key (mỗi dòng một private key).
2. Đổi tên file `toaddress.example.txt` thành `toaddress.txt` và thêm các địa chỉ nhận (mỗi dòng một địa chỉ).
3. **Cấu hình file `config.json`:**
   - File `config.json` chứa các thông số để điều chỉnh hành vi của chương trình.
   - Dưới đây là giải thích chi tiết về các trường trong file:
     - `totalTransactions`: Số lượng giao dịch tối thiểu (`min`) và tối đa (`max`) mà mỗi worker có thể thực hiện trong 12 giờ.
     - `interval`: Khoảng thời gian (tính bằng mili giây) giữa các giao dịch liên tiếp của một worker. Giá trị được chọn ngẫu nhiên trong khoảng `min` và `max`.
     - `delay`: Độ trễ ban đầu (tính bằng mili giây) trước khi một worker bắt đầu công việc. Giá trị được chọn ngẫu nhiên trong khoảng `min` và `max`.
     - `minAmount` và `maxAmount`: Số lượng token TEA tối thiểu và tối đa được chuyển trong mỗi giao dịch.

   Ví dụ file `config.json`:
   ```json
   {
       "totalTransactions": {
           "min": 120,
           "max": 150
       },
       "interval": {
           "min": 15000,
           "max": 120000
       },
       "delay": {
           "min": 1000,
           "max": 30000
       },
       "minAmount": 0.0001,
       "maxAmount": 0.0002
   }
   ```

## Chạy dự án

### Sử dụng Node.js

Chạy dự án trực tiếp:
```bash
npm i
npm start
```

### Sử dụng Docker


1. Cài đặt node:
   ```bash
   npm i
   ```

1. Xây dựng Docker image:
   ```bash
   docker compose up --build -d
   ```

2. Xem log của container:
   ```bash
   docker compose logs -f
   ```

## Giấy phép

Dự án này được cấp phép theo giấy phép MIT. Xem file [LICENSE](LICENSE) để biết thêm chi tiết.
