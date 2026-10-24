const licenseUrl = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';

export default function PortalCredits() {
  return (
    <section className="portal-credits" aria-labelledby="portal-credits-title">
      <div className="portal-credits-heading">
        <div>
          <span className="portal-credits-kicker">TRÂN TRỌNG NHỮNG NGƯỜI TẠO NÊN CUỘC CHƠI</span>
          <h2 id="portal-credits-title">Nguồn gốc &amp; giấy phép</h2>
        </div>
        <a className="portal-license-badge" href={licenseUrl} rel="license">CC BY-NC-SA 4.0 ↗</a>
      </div>
      <p className="portal-credits-intro">Hội Kín là dự án chuyển thể cộng đồng, miễn phí và phi thương mại. Đây là các bản web không chính thức, không liên kết, được tài trợ hay chứng thực bởi tác giả hoặc nhà phát hành trò chơi gốc.</p>
      <div className="portal-credits-grid">
        <article>
          <span className="portal-credits-number">01 / NGAI VÀNG</span>
          <h3><a href="https://onecrown.store/">One King One Crown ↗</a></h3>
          <p>Ghi công thiết kế trò chơi gốc One King One Crown, do Yancey International phát hành. Nguồn chuyển thể: <a href="https://cdn.shopify.com/s/files/1/1045/2605/3717/files/Print_At_Home_OKOC.pdf?v=1789749340">Official Print and Play</a> và <a href="https://cdn.shopify.com/s/files/1/1045/2605/3717/files/Game_Guide_Print.pdf?v=1789294911">Official Print and Play Guide</a>, được công bố theo <a href={licenseUrl}>CC BY-NC-SA 4.0</a>.</p>
          <p><strong>Những phần đã thay đổi:</strong> bản dịch và mô tả thẻ tiếng Việt; giao diện 3D/2D; phòng chơi trực tuyến, xử lý lượt, bỏ phiếu và bộ đếm giờ; các tùy chọn và biến thể luật cho bản web. Đây không phải bản sao nguyên trạng của trò chơi gốc.</p>
        </article>
        <article>
          <span className="portal-credits-number">02 / HỘI ĐỒNG BÍ MẬT</span>
          <h3><a href="https://www.secrethitler.com/">Secret Hitler ↗</a></h3>
          <p>Secret Hitler do <strong>Mike Boxleiter, Tommy Maranges và Mac Schubert</strong> sáng tạo, theo mục Credits &amp; License trong <a href="https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf">luật chính thức</a>. Trò chơi gốc được công bố theo <a href={licenseUrl}>CC BY-NC-SA 4.0</a>.</p>
          <p><strong>Những phần đã thay đổi:</strong> tiếng Việt, chơi nhiều người trên trình duyệt, giao diện 3D/2D, hoạt họa và hiệu ứng âm thanh. Hình từ <a href="https://www.secrethitler.com/assets/Secret_Hitler_Print_and_Play.pdf">Print &amp; Play</a> được cắt, ghép, xoay, nén WebP và phối màu khi hiển thị.</p>
        </article>
      </div>
      <div className="portal-credits-terms">
        <h3>Chia sẻ cuộc chơi, giữ trọn ghi công</h3>
        <p>Nội dung gốc được sử dụng theo giấy phép của từng trò chơi. Phần nội dung chuyển thể và các đóng góp của dự án vào phần chuyển thể được chia sẻ theo cùng giấy phép <a href={licenseUrl} rel="license">Creative Commons Ghi công – Phi thương mại – Chia sẻ tương tự 4.0 Quốc tế</a>. Bạn có thể sao chép, chia sẻ và sửa đổi phần nội dung này cho mục đích phi thương mại, với điều kiện giữ thông tin ghi công và thông báo bản quyền được cung cấp, dẫn nguồn và giấy phép, nêu các thay đổi, và chia sẻ phần chuyển thể theo cùng giấy phép. Không áp đặt điều khoản hoặc biện pháp công nghệ làm hạn chế các quyền giấy phép cho phép.</p>
        <p>Dự án được cung cấp miễn phí, không khai thác thương mại nội dung trò chơi, không bán bản số hoặc đặt nội dung sau tường phí. Với Secret Hitler, việc đưa bản chuyển thể lên kho ứng dụng cần được chủ sở hữu chấp thuận theo hướng dẫn chính thức.</p>
        <p className="portal-credits-fine">Tên gọi và nhãn hiệu thuộc chủ sở hữu tương ứng; giấy phép CC không cấp quyền nhãn hiệu hoặc quyền tuyên bố được chứng thực. Nội dung được cung cấp theo <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en#s5">điều khoản miễn trừ bảo đảm và giới hạn trách nhiệm</a> của giấy phép. Giấy phép nêu trên áp dụng cho phần nội dung trò chơi và phần chuyển thể, không thay thế giấy phép riêng của thư viện phần mềm hay tài nguyên bên thứ ba.</p>
      </div>
    </section>
  );
}
