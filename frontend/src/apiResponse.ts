/** Hosting error pages are HTML, not game API data. Keep those errors understandable. */
export async function readApiResponse<T>(response: Response): Promise<T> {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json') && !type.includes('+json')) {
    if (response.status === 400) {
      throw new Error('Backend từ chối yêu cầu (HTTP 400). Kiểm tra ALLOWED_HOSTS trên Render và deploy lại backend.');
    }
    if (response.status >= 500) {
      throw new Error(`Backend chưa sẵn sàng (HTTP ${response.status}). Chờ Render khởi động rồi thử lại; nếu vẫn lỗi, kiểm tra log backend.`);
    }
    throw new Error(`Máy chủ trả trang HTML thay vì dữ liệu game (HTTP ${response.status}). Kiểm tra VITE_API_URL trên Netlify và build lại frontend.`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Backend trả dữ liệu JSON không hợp lệ. Kiểm tra log backend.'); }
  if (!response.ok) throw new Error(data?.message || data?.error || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data as T;
}
