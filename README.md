# Vardiya Planlayıcı

Tarayıcıda çalışan bir personel çizelgeleme (shift rostering) aracı. Kullanıcı personeli, vardiya tanımlarını, günlük ihtiyacı ve kuralları girer; araç bunları bir karma tamsayılı programlama (MIP) modeline dönüştürür ve **HiGHS** çözücüsünün WebAssembly derlemesiyle (highs-js) doğrudan tarayıcıda çözer. Sunucu, veritabanı ya da ücretli servis gerekmez; site statik dosyalardan oluşur ve GitHub Pages gibi ücretsiz bir barındırıcıda yayınlanabilir.

> Durum: **v0.1 prototip.** Tek kullanıcılı; veriler tarayıcıda (localStorage) ve JSON dışa/içe aktarımla tutulur.

---

## Özellikler

- Personel tanımı: kıdem, haftalık min/maks vardiya, kaçınılan vardiya türleri
- **Birden fazla birim** (ör. hastanenin iki bölümü): her birimin ihtiyacı ayrı girilir; kişi için çalışabildiği birimler ve ana birim seçilir. Ortak ekip tek modelde çizelgelenir; kişi aynı gün yalnızca bir birimde çalışır ve kişisel kurallar (dinlenme, art arda gün, haftalık sınırlar) tüm birimlerdeki toplam çalışmaya uygulanır
- Vardiya tanımı: vardiyalar eklenip silinebilir; kısa kod, ad, renk ve başlangıç/bitiş saati ayarlanabilir (gece yarısını geçen vardiya otomatik olarak gece vardiyası sayılır). Kod değişince kilitler ve kaçınma tercihleri de güncellenir
- Renkler: vardiyalar ve birimler aynı paletten (veya serbest renk seçiciden) renklendirilir. Izgarada hücre rengi vardiyaya ya da birime göre seçilebilir; diğer boyut hücrenin alt şeridinde gösterilir
- Birim başına haftanın günü × vardiya ihtiyaç matrisi
- Izgara üzerinde hücreye tıklayarak **izin** (kesin) veya **sabit atama** (kilit) tanımlama; kilit vardiyayı sabitler, birimi çözücü seçer
- Kesin kurallar: minimum dinlenme süresi, art arda en fazla çalışma günü, haftalık maks
- Esnek hedefler: eksik ve fazla personel, kıdemli kapsama (birim bazında açılıp kapatılabilir), tercihler, haftalık min, ana birim dışına atama, ortak personelin birimler arasında dengeli çalışması, gece ve hafta sonu yükünde adalet
- Ağırlıklar arayüzden ayarlanabilir
- Birim × vardiya kapsama satırları; kişi başı birim dağılımı sütunu; eksik vardiya / tercih ihlali / gece dağılımı / ana birim dışı atama / birim dengesi göstergeleri
- CSV (birim koduyla, ör. `S/AC`) ve JSON kopyalama, JSON içe aktarma. Birim öncesi kayıtlar ve JSON dosyaları otomatik olarak tek birimli yapıya taşınır

## Matematiksel model

**Kümeler.** $E$ personel, $D$ planlama ufkundaki günler, $S$ vardiyalar, $J$ birimler, $B$ 7 günlük bloklar, $K \subseteq E$ kıdemliler, $J^K \subseteq J$ kıdemli kuralının uygulandığı birimler, $S^N \subseteq S$ gece vardiyaları, $D^H \subseteq D$ hafta sonu günleri. $F \subseteq S \times S$, dinlenme süresi $r$ saatin altında kalan ardışık gün vardiya çiftleri (ör. Gece → Sabah). $J_e \subseteq J$ kişinin çalışabildiği birimler, $h_e \in J_e$ ana birimi, $I_e \subseteq D$ izin günleri, $A_e \subseteq S$ kaçınılan vardiyalar, $\Lambda$ kilitli (kişi, gün, vardiya) atamaları.

**Parametreler.** $n_{dsj}$ birim ihtiyacı; $\underline{a}_e, \overline{a}_e$ haftalık min/maks; $L$ art arda en fazla gün; $c^{\cdot}$ ceza ağırlıkları.

**Karar değişkenleri.** $x_{edsj} \in \{0,1\}$ atama (yalnızca $j \in J_e$ için üretilir); $u_{dsj}, o_{dsj} \ge 0$ eksik/fazla personel; $k_{dsj} \ge 0$ kıdemli eksiği; $m_{eb} \ge 0$ haftalık min açığı; $N^{+}, N^{-}, H^{+}, H^{-}$ gece ve hafta sonu yükünün en büyük/en küçük değerleri; $\beta^{+}_e, \beta^{-}_e \ge 0$ kişinin birimlerdeki vardiya sayılarının en büyük/en küçük değeri ($\lvert J_e\rvert \ge 2$ için). Kısaltma: $y_{eds} = \sum_{j \in J_e} x_{edsj}$, kişinin o gün o vardiyada (herhangi bir birimde) çalışıp çalışmadığı.

**Amaç.**

$$
\min \sum_{e,d,s,j} \big(1 + c^{p}\,\mathbb{1}[s \in A_e] + c^{b}\,\mathbb{1}[j \ne h_e]\big)\,x_{edsj}
+ c^{u}\!\sum_{d,s,j} u_{dsj} + c^{o}\!\sum_{d,s,j} o_{dsj} + c^{k}\!\sum_{d,s,j} k_{dsj}
+ c^{m}\!\sum_{e,b} m_{eb} + c^{N}(N^{+}-N^{-}) + c^{H}(H^{+}-H^{-})
+ c^{\beta}\!\!\sum_{e : |J_e| \ge 2}\!\! (\beta^{+}_e-\beta^{-}_e)
$$

Ana birim dışı cezası $c^{b}$ ve birim dengesi $c^{\beta}$ yalnızca birden fazla birim olduğunda uygulanır. İkisi ters yönde çalışır: bir vardiyayı ana birimden diğerine kaydırmak $c^{b}$ kadar ceza ekler, kişinin birim farkını 2 azaltır. Bu yüzden $2c^{\beta} > c^{b}$ ise model eşit dağılımı tercih eder (varsayılan: $c^{b} = c^{\beta} = 5$). Kıdemli kapsama gibi daha ağır cezalar dengeyi yine bozabilir; örnekte Acil her vardiyada kıdemli istediği için ortak kıdemliler ağırlıkla Acil'de kalır.

**Kısıtlar.**

| Kural | İfade |
|---|---|
| Kapsama (birim başına) | $\sum_{e : j \in J_e} x_{edsj} + u_{dsj} - o_{dsj} = n_{dsj} \quad \forall d,s,j$ |
| Kıdemli kapsama (esnek) | $\sum_{e \in K : j \in J_e} x_{edsj} + k_{dsj} \ge 1 \quad \forall d,s,\ j \in J^K : n_{dsj} > 0$ |
| Günde tek vardiya, tek birim | $\sum_s y_{eds} \le 1 \quad \forall e,d$ |
| Birim yetkisi | $x_{edsj} = 0 \quad \forall j \notin J_e$ (değişken hiç üretilmez) |
| İzin | $y_{eds} = 0 \quad \forall e,\ d \in I_e$ (değişken hiç üretilmez) |
| Kilit | $y_{eds} = 1 \quad \forall (e,d,s) \in \Lambda$ (birimi model seçer) |
| Dinlenme | $y_{eds} + y_{e,d+1,s'} \le 1 \quad \forall e,d,\ (s,s') \in F$ |
| Art arda gün | $\sum_{t=d}^{d+L}\sum_s y_{ets} \le L \quad \forall e,d$ |
| Haftalık maks | $\sum_{d \in b}\sum_s y_{eds} \le \overline{a}_e \quad \forall e,b$ |
| Haftalık min (esnek) | $\sum_{d \in b}\sum_s y_{eds} + m_{eb} \ge \underline{a}_e - \lvert I_e \cap b\rvert \quad \forall e,b$ |
| Gece adaleti | $N^{-} \le \sum_{d}\sum_{s \in S^N} y_{eds} \le N^{+} \quad \forall e$ (geceden kaçınmayanlar) |
| Hafta sonu adaleti | $H^{-} \le \sum_{d \in D^H}\sum_{s} y_{eds} \le H^{+} \quad \forall e$ |
| Birim dengesi | $\beta^{-}_e \le \sum_{d,s} x_{edsj} \le \beta^{+}_e \quad \forall e : \lvert J_e\rvert \ge 2,\ j \in J_e$ |

Kişiye ait tüm kurallar $y$ üzerinden, yani birimlerin toplamına yazılır: iki bölüme ortak çalışan biri, iki bölümdeki vardiyalarının toplamıyla dinlenme, art arda gün ve haftalık sınırlara tabidir. Tek birimde $J = \{1\}$ olur ve model birim öncesi modelle birebir aynıdır.

Eksik personel değişkenleri sayesinde model, kilitler kesin kurallarla çelişmedikçe her zaman uygundur; karşılanamayan ihtiyaç kullanıcıya raporlanır. Fazla atama cezası $c^{o}$, adalet ağırlıklarından büyük tutulmalıdır; aksi halde model, yükü eşitlemek için ihtiyaçtan fazla kişi atayabilir.

**Ölçek.** 11 personel × 14 gün × 3 vardiya tek birimli örnek yaklaşık 450 ikili değişken ve 830 kısıt içerir ve tarayıcıda bir saniyenin altında optimal çözülür. 28 günlük ufuk (yaklaşık 900 değişken) de benzer sürede çözülür. Değişken sayısı kişinin çalışabildiği birim sayısıyla artar: varsayılan örnekte (Acil + Yoğun Bakım, 4 kişi iki birime ortak) yaklaşık 620 değişken ve 870 kısıt vardır.

## Mimari

```
Tarayıcı
 ├─ index.html        Arayüz + model üretici (CPLEX LP metni) + çözüm okuyucu
 ├─ vendor/highs.js   HiGHS'ın Emscripten/WebAssembly derlemesi (highs-js 1.15.4)
 └─ vendor/highs.wasm
Kalıcılık: localStorage + JSON dışa/içe aktarma
```

Akış: girdiler → `buildLP()` modeli LP formatında üretir → `highs.solve()` → `readSolution()` → ızgara.

Model kodu `index.html` içinde `/*MODEL-START*/ … /*MODEL-END*/` işaretleri arasındadır; test betiği bu bloğu çıkarıp Node'da aynı çözücüyle çalıştırır.

## Dosya yapısı

```
crew_scheduling/
├── index.html
├── onizleme.png
├── vendor/
│   ├── highs.js
│   ├── highs.wasm
│   └── HIGHS-JS-LICENSE
├── test/
│   └── test-model.js
├── package.json
├── LICENSE
├── .gitignore
└── README.md
```

## Yerelde çalıştırma

WebAssembly dosyası `file://` üzerinden yüklenemez; basit bir HTTP sunucusu gerekir:

```bash
cd crew_scheduling
python3 -m http.server 8000
# http://localhost:8000
```

## Test

```bash
npm install
npm test
```

Test betiği örnek veriyi çözer ve çözümü LP'den bağımsız olarak denetler: kapsama, izin, kilit, dinlenme, art arda gün ve haftalık maks kuralları. Ayrıca 28 günlük ufku, kilitler kurallarla çeliştiğinde `Infeasible` sonucunu, yetersiz kadroda eksiklerin doğru raporlandığını, iki birimli örnekte birim bazında kapsamayı ve kişilerin yalnızca yetkili oldukları birimlere atandığını, birim dengesi ağırlığının ortak personelin birimler arası farkını azalttığını (rakip kural yokken en fazla 1'e indirdiğini) ve tek birimli verinin birim öncesi modelle aynı LP'yi ürettiğini kontrol eder. Bir denetim başarısız olursa betik `1` çıkış koduyla biter.

## Ücretsiz yayınlama

**GitHub Pages**

1. GitHub'da yeni bir depo açın ve bu klasörün içeriğini kök dizine gönderin.
2. *Settings → Pages → Build and deployment*: Source olarak **Deploy from a branch**, branch olarak `main` / `/ (root)` seçin.
3. Birkaç dakika sonra site `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde yayında olur.

**Alternatifler:** Cloudflare Pages veya Netlify'da da derleme adımı olmadan aynı klasör yayınlanabilir (build command boş, output directory `/`). Üç seçenek de statik site barındırdığı için uyku/bekleme süresi yoktur.

## Sınırlamalar (v0.1)

- Tek kullanıcı; veriler tarayıcıya ve cihaza bağlıdır.
- Çözüm ana iş parçacığında çalışır, çözüm süresince arayüz donar (süre sınırı ayarlanabilir).
- Birim içinde yetkinlik bazlı ihtiyaç (ör. "Acil'de her gece en az bir travma sertifikalı") yoktur; birime atanabilirlik dışında tek nitelik "kıdemli"dir.
- İhtiyaç yalnızca haftanın gününe göre tanımlanır; resmî tatil veya belirli bir tarih için farklı ihtiyaç girilemez.
- Haftalık sınırlar vardiya **sayısı** üzerindendir, saat üzerinden değil; farklı uzunlukta vardiyalarda haftalık çalışma saati denetlenmez.
- Haftalık bloklar takvim haftası değil, başlangıç tarihinden itibaren 7'şer gündür.
- Planlama ufkunun öncesi bilinmez: önceki dönemin son günleri (ör. Pazar gecesi → Pazartesi sabahı dinlenmesi, art arda gün sayacı) modele girmez; ardışık iki dönemin birleşiminde kural ihlali oluşabilir.
- Adalet ölçütü maks−min farkıdır ve yalnızca mevcut ufku kapsar; kısmi zamanlı personel için oransal adalet ve dönemler arası birikim yoktur.
- İzin yalnızca kesindir; "mümkünse izin" gibi esnek istek girilemez.
- Uygun çözüm yoksa hangi kilidin hangi kuralla çeliştiği gösterilmez.
- Kilit yalnızca vardiyayı sabitler; bir kişiyi belirli bir **birime** kilitlemek mümkün değildir (birimi çözücü seçer).
- Birimler arası geçişte ek kural yoktur: kişinin gün gün birim değiştirmesi cezalandırılmaz, birimlerin farklı vardiya saatleri olamaz.

## Olası genişletmeler

Aşağıdaki maddeler mevcut kodun yapısına göre gruplanmıştır. *Model* notları, eklemenin MIP modeline nasıl yansıyacağını özetler.

### Öncelik önerisi

| Ufuk | Genişletmeler | Gerekçe |
|---|---|---|
| Kısa vade (düşük efor) | Web Worker, CI, tarih bazlı ihtiyaç, dönemler arası süreklilik, uygunsuzluk teşhisi | Mevcut sınırlamaları kapatır; modelde küçük değişiklik |
| Orta vade | Saat bazlı sınırlar, yetkinlik bazlı ihtiyaç, esnek izin isteği, desen kuralları, yeniden planlama, Excel/ICS | Gerçek kullanımda en sık istenen kurallar |
| Uzun vade | Çok kullanıcılı sürüm, talep tahmini ve belirsizlik, CP-SAT servisi, kolon üretimi | Mimari değişiklik veya sunucu gerektirir |

### 1. Çözüm deneyimi ve arayüz

- **Web Worker:** highs-js'i bir worker içinde yükleyip çözmek; arayüz donmaz, "Durdur" düğmesi worker'ı sonlandırarak iptal sağlar. Çözücü günlüğünden ilerleme (en iyi amaç / alt sınır, MIP boşluğu) gösterilebilir.
- **Sıcak başlangıç:** önceki çözümü başlangıç çözümü olarak vermek (highs-js'in bu API'yi dışa açtığı doğrulanmalı; açmıyorsa önceki çözüme yakınlık için küçük bir ceza terimi alternatif olur).
- **Uygunsuzluk teşhisi:** kilitleri kesin eşitlik yerine çok yüksek cezalı esnek kısıt olarak kurup ihlal edilen kilitleri listelemek; böylece `Infeasible` yerine "Mehmet'in 1–6. gün kilitleri art arda 5 gün kuralıyla çelişiyor" gibi somut bir mesaj verilir.
- **Açıklanabilirlik:** amaç değerini bileşenlerine ayırmak (eksik, fazla, kıdemli, tercih, haftalık min, gece/hafta sonu adaleti) ve kişi başı ceza dökümü göstermek.
- **Elle düzenleme ve anlık denetim:** çözüm sonrası hücreleri sürükle-bırak ile takas etmek; değişiklikte kural ihlallerini çözmeden işaretlemek. `test/test-model.js` içindeki `check()` denetleyicisi ortak modüle taşınarak arayüzde yeniden kullanılabilir.
- **Alternatif çözümler:** mevcut çözümü dışlayan bir kesit ($\sum_{x^*_{eds}=1} x_{eds} \le |x^*|-k$) ekleyip yeniden çözerek benzer maliyetli farklı çizelgeler sunmak.
- **Diğer:** yazdırma görünümü, PWA/çevrimdışı çalışma, İngilizce arayüz (i18n), kişi bazlı filtre ve "benim çizelgem" görünümü.

### 2. Model genişletmeleri

- **Tarih bazlı ihtiyaç ve resmî tatiller:** haftalık şablonun üzerine belirli tarihler için geçersiz kılma. *Model:* $n_{ds}$ hafta gününden değil tarihten okunur.
- **Saat bazlı sınırlar ve fazla mesai:** vardiya uzunluğu $\ell_s$ ile $\sum_{d\in b}\sum_s \ell_s x_{eds} \le \overline{h}_e + f_{eb}$; $f_{eb}$ fazla mesai değişkeni cezalı ve üst sınırlı (ör. haftalık 45 saat).
- **Yetkinlik / rol bazlı ihtiyaç:** $Q$ yetkinlikler, $E_q \subseteq E$; $\sum_{e \in E_q} x_{eds} + k^q_{ds} \ge n^q_{ds}$. Mevcut kıdemli kısıtı bunun özel halidir ve bu genellemeye taşınabilir.
- **Esnek izin isteği ↔ kesin izin:** hücre döngüsüne "istek" durumu; *Model:* değişken üretilir ama $c^{r}\sum_s x_{eds}$ cezası eklenir. Aynı mekanizmayla pozitif tercih ("bu gün çalışmak istiyorum") da desteklenir.
- **Hafta sonu bütünlüğü:** $\sum_s x_{e,\text{Cmt},s} = \sum_s x_{e,\text{Paz},s}$ (kesin) veya farkı cezalı (esnek).
- **Desen kuralları:**
  - izole çalışma günü / izole izin günü yasağı veya cezası (çalış–izin–çalış, izin–çalış–izin),
  - art arda en fazla gece sayısı ve gece serisinden sonra en az 2 gün izin,
  - ileri rotasyon (Sabah → Akşam → Gece; geriye dönüşler cezalı),
  - dönem başına en az bir tam hafta sonu izni.
- **Birlikte / ayrı çalışma:** iki kişinin aynı vardiyada olmaması ($x_{eds} + x_{e'ds} \le 1$) veya yeni personelin bir mentorla aynı vardiyada olması.
- **Oransal adalet:** maks−min yerine kişi başı hedeften sapma; $g_e$ kişinin gece sayısı, $\rho_e$ sözleşme oranı ise $|g_e - \rho_e \bar g|$ doğrusallaştırılarak cezalandırılır. Kısmi zamanlı personel doğru temsil edilir.
- **Dönemler arası süreklilik:** önceki çizelgenin son $L$ günü sabit girdi olarak modele eklenir (dinlenme ve art arda gün kısıtları sınırı aşar); geçmiş gece/hafta sonu sayıları adalet hesabına taşınır.
- **Takvim haftası hizalaması:** haftalık blokların başlangıç tarihi yerine Pazartesi'den başlaması; kısmi haftalarda sınırların orantılanması.
- **Çok birimli model için sonraki adımlar** (temel birim desteği eklendi):
  - birime kilit: hücre döngüsünde vardiya + birim seçimi; *Model:* $x_{edsj} = 1$,
  - birim sürekliliği: ardışık günlerde birim değiştirmeye ceza ($z_{ed} \ge \sum_s x_{edsj} - \sum_s x_{e,d+1,s,j}$ türü yardımcı değişkenle),
  - birime özgü vardiya saatleri ve birimler arası geçiş süresi,
  - birim başına haftalık en az/en çok çalışma (ör. "Can haftada en fazla 2 vardiya Acil'e"),
  - birim dengesinin hedef oranlarla tanımlanması (ör. %70 Acil, %30 Yoğun Bakım) ve gece/hafta sonu adaletinin birim içinde ölçülmesi,
  - ızgarada birime göre filtre ve birim bazında görünüm.
- **Sözlüksel (lexicographic) amaç:** ağırlık ayarlamak yerine sırayla çözmek — önce eksik personeli en aza indir, bu değeri kısıt olarak sabitle, sonra kıdemli kapsama, sonra adalet. Ağırlık seçiminin yol açtığı "fazla atama ile adalet" türü etkileşimleri ortadan kaldırır.

### 3. Operasyonel yeniden planlama

- **Son dakika değişikliği:** biri hastalandığında yayınlanmış çizelgeden en az sapmayla yeniden çözmek. *Model:* geçmiş günler kilitlenir, yayınlanmış çözüm $\hat x$ için $\sum_{\hat x_{eds}=1}(1-x_{eds}) + \sum_{\hat x_{eds}=0} x_{eds}$ cezası eklenir.
- **Yedek / çağrı (on-call) havuzu:** her gün için çağrılabilir personel ataması ve bunun adil dağılımı.
- **Takas talepleri:** personelin vardiya takası önermesi, kural denetimi ve yönetici onayı.
- **Sürüm geçmişi:** yayınlanan her çizelgenin saklanması ve iki sürüm arasındaki farkın gösterilmesi.

### 4. Çok kullanıcılı sürüm

- Supabase (Postgres + kimlik doğrulama) ile ekip, personel, çizelge, istek ve takas tabloları; satır düzeyinde güvenlik ile yönetici/personel rolleri.
- Personelin kendi tercih ve izin isteklerini girdiği görünüm; bir istek son tarihi ve ardından yöneticinin çözdürmesi.
- Yayınlanan çizelgede e-posta veya anlık bildirim.
- Çözüm tarayıcıda kalabilir (sunucu maliyeti yok); büyük örnekler için 5. bölümdeki servis kullanılır.

### 5. Talep ve belirsizlik

- **Talep tahmini:** geçmiş doluluk / iş yükü verisinden gün × vardiya ihtiyacının tahmini (mevsimsellik, tatil etkisi).
- **Robust kapsama:** ihtiyacın bir belirsizlik kümesinde değiştiği varsayımıyla kapsama kısıtları; ya da senaryo tabanlı iki aşamalı model (ilk aşama çizelge, ikinci aşama yedek çağırma).
- **Devamsızlık payı:** beklenen devamsızlık oranına göre ihtiyaca güvenlik payı eklenmesi.

### 6. Ölçek ve çözücü

- **OR-Tools CP-SAT servisi:** büyük örnekler ve desen kuralları ağırlıklı modeller için isteğe bağlı Python servisi; aynı JSON girdisini alır.
- **Simetri kırma:** aynı profildeki (kıdem, min/maks, kaçınma) personel için sıralama kısıtları; çözüm süresini belirgin biçimde azaltabilir.
- **Ayrıştırma:** uzun ufuklarda kayan pencere (rolling horizon) — haftaları sırayla çöz, önceki haftayı kilitle.
- **Kolon üretimi:** her personel için olası çizelgeleri (roster) kolon olarak üreten küme kaplama modeli; yüzlerce personelli örnekler için.
- **Benchmark seti:** farklı boyut ve sıkılıkta örnekler; çözüm süresi ve amaç değerinin sürümler arasında izlenmesi.

### 7. Dışa aktarma ve entegrasyon

- Excel (`.xlsx`) ve PDF çıktısı; vardiya renkleriyle biçimlendirilmiş.
- Kişi bazlı takvim (ICS) dosyası; Google/Outlook takvim aboneliği.
- Bordro için kişi başı saat, gece, hafta sonu ve fazla mesai özeti (CSV).
- Personel listesinin CSV/Excel'den içe aktarılması.

### 8. Kalite ve test

- `test/test-model.js` içindeki denetimleri bir test çatısına (ör. `node:test`) taşıyıp senaryoları ayrı testler halinde raporlamak.
- GitHub Actions ile her gönderimde `npm test`.
- Rastgele örnek üretip denetleyiciyle doğrulayan özellik tabanlı (property-based) testler.
- Model kodunun `index.html` dışına ayrı bir ES modülüne taşınması (test betiğindeki metin kesme yönteminin yerine).

## Lisans

Bu proje **[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)** lisansıyla dağıtılır (ayrıntı: `LICENSE`).

- **Serbest:** kişisel kullanım, araştırma, eğitim, deneme; hayır kurumları, eğitim kurumları, kamu araştırma ve kamu sağlık kuruluşları ile devlet kurumlarında kullanım; kodu inceleme, değiştirme ve aynı lisansla paylaşma.
- **Yasak:** ticari amaçla kullanım — ör. ürüne veya ücretli bir hizmete dönüştürme, satma, bir şirketin kendi işleri için kullanması.
- Ticari kullanım için lisans sahibinden ayrıca izin alınması gerekir.

Bu lisans OSI tanımına göre “açık kaynak” değildir; kaynak kodu görülebilir ama kullanım ticari olmayan amaçlarla sınırlıdır.

`vendor/` altındaki highs-js ve HiGHS kendi lisanslarıyla (MIT) dağıtılır; ayrıntı `vendor/HIGHS-JS-LICENSE` dosyasındadır. PolyForm lisansı bu dosyaları kapsamaz.
