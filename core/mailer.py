# === [TAG MODUL: Pengirim Email SMTP (Mailer)] ===
# Penjelasan: Modul pengirim surat elektronik untuk proses pemulihan akun (forgot/reset password) menggunakan protokol SMTP terenkripsi TLS/SSL

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import current_app


# === [TAG FUNGSI: Pengiriman Email Reset Password (send_reset_email)] ===
# Penjelasan: Merangkai pesan email dwiformat (HTML & Plain Text) berisi tautan token reset sandi berbatas waktu (1 jam), lalu mengirimkannya via server SMTP (misal Gmail)
def send_reset_email(to_email: str, reset_url: str):
    """Kirim email berisi link token reset password."""
    smtp_server = current_app.config.get('MAIL_SERVER')
    smtp_port   = current_app.config.get('MAIL_PORT')
    smtp_user   = current_app.config.get('MAIL_USERNAME')
    smtp_pass   = current_app.config.get('MAIL_PASSWORD')
    sender      = current_app.config.get('MAIL_DEFAULT_SENDER')
    use_tls     = current_app.config.get('MAIL_USE_TLS')

    if not smtp_user or not smtp_pass:
        raise Exception("Konfigurasi email SMTP (MAIL_USERNAME / MAIL_PASSWORD) belum diatur di .env")

    msg = MIMEMultipart('alternative')
    msg['From'] = sender
    msg['To'] = to_email
    msg['Subject'] = "Reset Password Akun DocuMind"

    text_body = f"""
Halo,

Kami menerima permintaan untuk mereset password akun DocuMind Anda.
Silakan kunjungi tautan berikut untuk membuat password baru:
{reset_url}

Tautan ini hanya berlaku selama 1 jam. Jika Anda tidak pernah meminta reset password, Anda dapat mengabaikan email ini dengan aman.

Salam,
Tim DocuMind
    """

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f46e5;">Reset Password DocuMind</h2>
        <p>Halo,</p>
        <p>Kami menerima permintaan untuk mereset password akun DocuMind Anda. Klik tombol di bawah ini untuk mengatur password baru:</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{reset_url}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
        </p>
        <p>Tautan ini hanya berlaku selama <strong>1 jam</strong>. Jika Anda tidak bisa mengklik tombol di atas, salin dan tempel tautan berikut di browser Anda:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">{reset_url}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #999;">Jika Anda tidak merasa meminta pergantian password ini, abaikan email ini. Akun Anda tetap aman.</p>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        # Koneksi SMTP SSL (Port 465) atau STARTTLS (Port 587)
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            if use_tls:
                server.starttls()
        
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"[MAIL ERROR] Failed to send email: {e}")
        raise e
