# Hold Passo doldur

Chrome uzantısı. Araç çubuğundan aç/kapat. Yalnızca Hold veya admin aktarma ekranından sonra açılan Passo girişini doldurur.

Aktar’a basınca seçilen kayıtlı hesap veya yazılan e-posta/şifre, o anda açılan Passo sayfasına gider. Cloudflare / Turnstile / captcha varsa Enter’a basmaz.

## Yükle

1. Chrome → `chrome://extensions`
2. Geliştirici modu
3. Paketlenmemiş öğe yükle → `PassoBot/extension`
4. Uzantıyı yenile (güncellemeden sonra)

Yerel Hold (`5173`) ve admin (`5174`) hazır. Canlı adresi uzantı seçeneklerine `https://senin-hold-adresin/*` olarak ekle.

## reCAPTCHA

Token, botun açtığı boş profilden değil, bu Chrome’dan okunur. Google hesabı bu profilde açık olsun.

1. Uzantıyı yenile.
2. Bu Chrome’da [passo.com.tr](https://www.passo.com.tr/tr) açık kalsın.
3. API yerelde `http://127.0.0.1:4000`. Başka bir adreste seçeneklere API adresini ve `RECAPTCHA_CHROME_SECRET` değerini yaz.
