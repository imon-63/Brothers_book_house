import type { Catalog, Product, VerticalId } from "./types";

const book = (
  row: Omit<Product, "vertical" | "stock" | "old"> & { old?: number; stock?: number }
): Product => ({
  ...row,
  old: row.old ?? 0,
  vertical: "book",
  stock: row.stock ?? (row.id % 9 === 0 ? 0 : 12),
});

export const VERTICALS: Catalog["verticals"] = [
  {
    id: "book",
    name: "বই",
    search: "কোন বই খুঁজছেন?",
    kicker: "চলো বই",
    title: "আপনার পরবর্তী",
    sub: "প্রিয় বইটি এখানেই",
    lead: "অষ্টম থেকে অনার্স, ভর্তি গাইড আর BCS ও ব্যাংক প্রস্তুতি — ক্যাটাগরি বেছে বই নিন। পেমেন্ট SSLCOMMERZ।",
    popular: "জনপ্রিয় বইসমূহ",
    how1: "বই বাছুন",
    how1p: "ক্যাটাগরি বা সার্চ থেকে পছন্দের বই কার্টে দিন।",
  },
  {
    id: "food",
    name: "ঘরের বাজার",
    search: "তেল, মধু, খেজুর খুঁজুন",
    kicker: "চলো · ঘরের বাজার",
    title: "ঘরের বাজার",
    sub: "খাঁটি পণ্য, ঘরে পৌঁছে",
    lead: "দেশি সরিষার তেল, গাওয়া ঘি, সুন্দরবনের মধু, আজওয়া খেজুর আর গুঁড়া মসলা — ঘরের বাজার থেকে।",
    popular: "ঘরের বাজারের জনপ্রিয়",
    how1: "পণ্য বাছুন",
    how1p: "তেল, মধু, খেজুর বা মসলা কার্টে দিন।",
  },
  {
    id: "gadget",
    name: "গ্যাজেট",
    search: "কোন গ্যাজেট খুঁজছেন?",
    kicker: "চলো গ্যাজেট",
    title: "স্মার্ট জিনিস",
    sub: "যেগুলো কাজকে সহজ করে",
    lead: "ইয়ারবাড, পাওয়ার ব্যাংক, ফ্যান আর UPS — Tech Jhuli স্টাইলে অরিজিনাল গ্যাজেট।",
    popular: "ট্রেন্ডিং গ্যাজেট",
    how1: "গ্যাজেট বাছুন",
    how1p: "ক্যাটাগরি বা সার্চ থেকে পছন্দের আইটেম কার্টে দিন।",
  },
];

export const VERTICAL_ORDER: VerticalId[] = ["book", "food", "gadget"];

const products: Product[] = [
  book({ id: 1, title: "অষ্টম শ্রেণি — বাংলা প্রথম ও দ্বিতীয় পত্র মাস্টার বুক", author: "টেন মিনিট স্কুল", price: 350, sold: 410, pages: 160, color: "#7A2430", cat: "অষ্টম শ্রেণি", desc: "রকমারির দাম ৳৩৫০। অষ্টম শ্রেণির বাংলা প্রথম ও দ্বিতীয় পত্র।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Class_8_Bangla_1st_and_2nd_Paper_Master_-10_Minute_School-1f732-536155.jpg" }),
  book({ id: 2, title: "অষ্টম শ্রেণি — গণিত মাস্টার বুক", author: "টেন মিনিট স্কুল", price: 300, sold: 380, pages: 180, color: "#2C3A5A", cat: "অষ্টম শ্রেণি", desc: "রকমারির দাম ৳৩০০। অষ্টম শ্রেণির গণিত।", stock: 0, image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Class_8_Math_Master_Book-10_Minute_School-d8461-536166.jpg" }),
  book({ id: 3, title: "পাঞ্জেরী মাধ্যমিক বাংলা প্রথম ও দ্বিতীয় পত্র", author: "পাঞ্জেরী সম্পাদনা পর্ষদ", price: 840, sold: 520, pages: 220, color: "#7A2430", cat: "নবম-দশম", desc: "রকমারির দাম ৳৮৪০। নবম-দশম শ্রেণি, এসএসসি ২০২৮।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Panjeree_Maddhomik_Bangla_1st__2nd_Paper-Panjeree_Shompadona_Porshod-59eb4-542079.jpg" }),
  book({ id: 4, title: "পাঞ্জেরী মাধ্যমিক পদার্থবিজ্ঞান", author: "পাঞ্জেরী সম্পাদনা পর্ষদ", price: 730, sold: 470, pages: 240, color: "#245A6B", cat: "নবম-দশম", desc: "রকমারির দাম ৳৭৩০। এসএসসি ২০২৭, নবম ও দশম শ্রেণি।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Panjeree_Maddhomik_Podarthobiggan_Class_-Panjeree_Shompadona_Porshod-9ef41-466474.jpg" }),
  book({ id: 5, title: "এইচএসসি উচ্চতর গণিত মাস্টারবুক — ১ম খণ্ড", author: "টেন মিনিট স্কুল", price: 400, sold: 390, pages: 360, color: "#1C3A5A", cat: "ইন্টারমিডিয়েট", desc: "রকমারির দাম ৳৪০০। এইচএসসি উচ্চতর গণিত।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/HSC_Higher_Mathematics_Masterbook_Cycle_-10_Minute_School-ebbad-511538.png" }),
  book({ id: 6, title: "পাঞ্জেরী রসায়ন দ্বিতীয় পত্র", author: "পাঞ্জেরী সম্পাদনা পর্ষদ", price: 600, sold: 340, pages: 310, color: "#3D5A4C", cat: "ইন্টারমিডিয়েট", desc: "রকমারির দাম ৳৬০০। একাদশ-দ্বাদশ শ্রেণি / এইচএসসি।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Panjeree_Rosayon_Second_Paper_Class_11_1-Panjeree_Shompadona_Porshod-2852f-512185.jpg" }),
  book({ id: 7, title: "কিউএনএ ইঞ্জিনিয়ারিং অ্যানালাইসিস মেগাবুক — উচ্চতর গণিত", author: "কিউএনএ পাবলিকেশন্স", price: 630, old: 700, sold: 280, pages: 400, color: "#2C3A5A", cat: "ইঞ্জিনিয়ারিং ভর্তি", desc: "রকমারির দাম ৳৬৩০, আগের দাম ৳৭০০। ইঞ্জিনিয়ারিং ভর্তির উচ্চতর গণিত।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/QNA_Engineering_Analysis_Megabook_Higher-QNA_Publications_Author_Porishod-b2617-568060.png" }),
  book({ id: 8, title: "বুয়েট প্রশ্নব্যাংক", author: "জয়কলি সম্পাদনা পরিষদ", price: 610, old: 900, sold: 210, pages: 280, color: "#6B3A1F", cat: "ইঞ্জিনিয়ারিং ভর্তি", desc: "রকমারির দাম ৳৬১০, আগের দাম ৳৯০০।", stock: 0, image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Buet_Prosnobank-Joykali_Reform_Council-f6227-559896.jpg" }),
  book({ id: 9, title: "গুচ্ছনলেজ (মানবিক)", author: "আসপেক্ট সিরিজ", price: 510, old: 761, sold: 360, pages: 340, color: "#4A2744", cat: "বিশ্ববিদ্যালয় ভর্তি", desc: "রকমারির দাম ৳৫১০, আগের দাম ৳৭৬১। গুচ্ছ ভর্তি — মানবিক।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/GST_knowlege-Aspect_Series_Authors-04858-571514.jpg" }),
  book({ id: 10, title: "জোবায়ের’স জিকে (সাধারণ জ্ঞান)", author: "জোবায়ের আহমেদ", price: 450, old: 490, sold: 300, pages: 260, color: "#1F4A3A", cat: "বিশ্ববিদ্যালয় ভর্তি", desc: "রকমারির দাম ৳৪৫০, আগের দাম ৳৪৯০।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Zubairs_GK_General_Knowledge_-Zubair_Ahmed-c24d9-567764.jpg" }),
  book({ id: 11, title: "রাইডার্স জাতীয় বিশ্ববিদ্যালয় ভর্তি গাইড", author: "সৈয়দ সাকিব আলম", price: 369, old: 450, sold: 190, pages: 220, color: "#3D5A4C", cat: "জাতীয় বিশ্ববিদ্যালয় ভর্তি", desc: "রকমারির দাম ৳৩৬৯, আগের দাম ৳৪৫০। মানবিক বিভাগ।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Riders_National_University_Admission_Gui-Sayed_Sakib_Alam-4f57a-461131.jpg" }),
  book({ id: 12, title: "সেঞ্চুরি জাতীয় বিশ্ববিদ্যালয় অনার্স ভর্তি গাইড", author: "সেঞ্চুরি প্রকাশনী", price: 319, old: 480, sold: 160, pages: 180, color: "#245A6B", cat: "জাতীয় বিশ্ববিদ্যালয় ভর্তি", desc: "রকমারির দাম ৳৩১৯, আগের দাম ৳৪৮০। বিজ্ঞান বিভাগ।", stock: 0, image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Century_National_University_Honors_Admis-Century_Prokashonir_Sampadhona_Porishad-e0161-458615.jpg" }),
  book({ id: 13, title: "কিউএনএ মেডিকেল এনালাইসিস মেগাবুক জীববিজ্ঞান", author: "কিউএনএ পাবলিকেশন্স", price: 612, old: 680, sold: 330, pages: 380, color: "#1F4A3A", cat: "মেডিকেল ভর্তি", desc: "রকমারির দাম ৳৬১২, আগের দাম ৳৬৮০। মেডিকেল ভর্তির জীববিজ্ঞান।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/QNA_Medical_Analysis_Megabook_Biology-QNA_Publications_Author_Porishod-57a04-568064.png" }),
  book({ id: 14, title: "কিউএনএ মেডিকেল এনালাইসিস মেগাবুক রসায়ন", author: "কিউএনএ পাবলিকেশন্স", price: 612, old: 680, sold: 250, pages: 360, color: "#2C3A5A", cat: "মেডিকেল ভর্তি", desc: "রকমারির দাম ৳৬১২, আগের দাম ৳৬৮০। মেডিকেল ভর্তির রসায়ন।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/QNA_Medical_Analysis_Megabook_Chemistry-QNA_Publications_Author_Porishod-1bba5-568062.png" }),
  book({ id: 15, title: "পূবালী ব্যাংক নিয়োগ গাইড", author: "রিসেন্ট পাবলিকেশন", price: 159, old: 300, sold: 440, pages: 300, color: "#6B3A1F", cat: "ব্যাংক প্রস্তুতি", desc: "রকমারির দাম ৳১৫৯, আগের দাম ৳৩০০। এমসিকিউ ও রিটেন।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Pubali_Bank_Niyog_Guide_Mcq_And_Written-Recent_Publication_Editorial_Board-5047a-461070.jpg" }),
  book({ id: 16, title: "Bank Math Bible", author: "আব্দুল্লাহ আল মাহমুদ", price: 479, old: 620, sold: 290, pages: 240, color: "#7A2430", cat: "ব্যাংক প্রস্তুতি", desc: "রকমারির দাম ৳৪৭৯, আগের দাম ৳৬২০। ব্যাংক পরীক্ষার গণিত।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/27df9e898_189629.jpg" }),
  book({ id: 17, title: "তাপ ও তাপগতিবিদ্যা", author: "প্রফেসর এস. এম. মোকছেদ আলী", price: 329, old: 357, sold: 120, pages: 420, color: "#245A6B", cat: "বিশ্ববিদ্যালয় বিজ্ঞান", desc: "রকমারির দাম ৳৩২৯, আগের দাম ৳৩৫৭। অনার্স পদার্থবিজ্ঞান।", stock: 0, image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/cae11f665_216844.jpeg" }),
  book({ id: 18, title: "মৌলিক জৈব রসায়ন", author: "মো: রুস্তম আলী", price: 373, old: 429, sold: 110, pages: 400, color: "#3D5A4C", cat: "বিশ্ববিদ্যালয় বিজ্ঞান", desc: "রকমারির দাম ৳৩৭৩, আগের দাম ৳৪২৯। অনার্স রসায়ন।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/eaa914254_216880.jpeg" }),
  book({ id: 19, title: "সাহিত্য তত্ত্ব-কথা", author: "মুহাম্মদ আবুল ফজল", price: 294, sold: 140, pages: 280, color: "#7A2430", cat: "বিশ্ববিদ্যালয় মানবিক", desc: "রকমারির দাম ৳২৯৪। বাংলা সাহিত্যের রূপ, ছন্দ ও অলংকার।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/Sahityo_Tottho_Kotha_Sahityer_Rup_Chondo-Muhammad_Abul_Fazal-9050a-72120.jpg" }),
  book({ id: 20, title: "বাংলাদেশের ইতিহাস, ভাষা, সংস্কৃতি ও পরিচয়", author: "মোঃ আসাদুজ্জামান", price: 366, old: 430, sold: 95, pages: 260, color: "#4A2744", cat: "বিশ্ববিদ্যালয় মানবিক", desc: "রকমারির দাম ৳৩৬৬, আগের দাম ৳৪৩০।", image: "https://rokbucket.rokomari.io/ProductNew20190903/260X372/History_Language_Culture_and_Identity_of-Md_Asaduzzaman-c0187-565947.jpg" }),
  { id: 301, title: "দেশি সরিষার তেল ১ লিটার", author: "ঘরের বাজার", unit: "১ লিটার", price: 340, old: 0, sold: 860, color: "#6B3A1F", vertical: "food", cat: "তেল ও ঘি", sub: "সরিষার তেল", desc: "ঘরের বাজারের দেশি সরিষার তেল — রান্নার জন্য ১ লিটার।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/ETt5J1767248095.jpg" },
  { id: 302, title: "দেশি সরিষার তেল ৫ লিটার", author: "ঘরের বাজার", unit: "৫ লিটার", price: 1700, old: 0, sold: 1240, color: "#7A2430", vertical: "food", cat: "তেল ও ঘি", sub: "সরিষার তেল", desc: "ঘরের বাজারের বেস্ট সেলার — মাঘি সরিষার তেল, ৫ লিটার।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/vkVdH1767248022.jpg" },
  { id: 303, title: "গাওয়া ঘি ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 1000, old: 0, sold: 540, color: "#C4A15A", vertical: "food", cat: "তেল ও ঘি", sub: "ঘি", desc: "গাওয়া ঘি — ভাত, রুটি আর মিষ্টিতে।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/Mcm9m1789014784-light-1000x1000.jpg" },
  { id: 304, title: "গাওয়া ঘি ১ কেজি", author: "ঘরের বাজার", unit: "১ কেজি", price: 1990, old: 0, sold: 410, color: "#B86A2A", vertical: "food", cat: "তেল ও ঘি", sub: "ঘি", desc: "গাওয়া ঘি ১ কেজি প্যাক — সংসারের জন্য।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/JNfha1788276511-light-1000x1000.jpg" },
  { id: 305, title: "সুন্দরবন মধু ১ কেজি", author: "ঘরের বাজার", unit: "১ কেজি", price: 2500, old: 0, sold: 380, color: "#7A2430", vertical: "food", cat: "মধু", sub: "সুন্দরবন", desc: "সুন্দরবনের মধু, ১ কেজি।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/KWSqQ1785577173-light-1000x1000.jpg" },
  { id: 306, title: "ব্ল্যাক সিড মধু ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 800, old: 0, sold: 290, color: "#1F4A3A", vertical: "food", cat: "মধু", sub: "ফুলের মধু", desc: "কালোজিরা মেশানো মধু — ৫০০ গ্রাম।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/JdeWl1767418564.jpg" },
  { id: 307, title: "লিচু ফ্লাওয়ার মধু ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 700, old: 0, sold: 210, color: "#3D5A4C", vertical: "food", cat: "মধু", sub: "ফুলের মধু", desc: "লিচু ফুলের মধু, ৫০০ গ্রাম।", stock: 0, image: "https://cdn.ghorerbazar.com/productImages/TtgOl1767418640.jpg" },
  { id: 308, title: "আজওয়া খেজুর ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 1100, old: 0, sold: 620, color: "#6B3A1F", vertical: "food", cat: "খেজুর", sub: "আজওয়া", desc: "আজওয়া প্রিমিয়াম ফ্রেশ খেজুর, ৫০০ গ্রাম।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/EESft1782301652.webp" },
  { id: 309, title: "আজওয়া খেজুর ১ কেজি", author: "ঘরের বাজার", unit: "১ কেজি", price: 2200, old: 0, sold: 470, color: "#4A2744", vertical: "food", cat: "খেজুর", sub: "আজওয়া", desc: "আজওয়া প্রিমিয়াম ফ্রেশ খেজুর, ১ কেজি।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/TY03p1782300772.webp" },
  { id: 310, title: "সুকারি খেজুর ১ কেজি", author: "ঘরের বাজার", unit: "১ কেজি", price: 1500, old: 0, sold: 330, color: "#B86A2A", vertical: "food", cat: "খেজুর", sub: "সুকারি", desc: "সুকারি মুফাত্তাল মালাকি খেজুর, ১ কেজি।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/VpK6Q1776762386.jpg" },
  { id: 311, title: "মরিচের গুঁড়া ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 400, old: 0, sold: 510, color: "#7A2430", vertical: "food", cat: "মসলা", sub: "গুঁড়া মসলা", desc: "ঝাল মরিচের গুঁড়া — রোজকার রান্নার জন্য।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/bXoHM1787487227-light-1000x1000.jpg" },
  { id: 312, title: "হলুদের গুঁড়া ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 295, old: 0, sold: 690, color: "#C4A15A", vertical: "food", cat: "মসলা", sub: "গুঁড়া মসলা", desc: "হলুদের গুঁড়া, ৫০০ গ্রাম।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/TNMp41787487432-light-1000x1000.jpg" },
  { id: 313, title: "ধনিয়ার গুঁড়া ৫০০ গ্রাম", author: "ঘরের বাজার", unit: "৫০০ গ্রাম", price: 240, old: 0, sold: 450, color: "#3D5A4C", vertical: "food", cat: "মসলা", sub: "গুঁড়া মসলা", desc: "ধনিয়ার গুঁড়া, ৫০০ গ্রাম।", stock: 12, image: "https://cdn.ghorerbazar.com/productImages/RPYh51787487346-light-1000x1000.jpg" },
  { id: 401, title: "Hoco EQ34 Plus TWS", author: "Tech Jhuli", unit: "১ জোড়া", price: 1450, old: 1790, sold: 210, color: "#2C3A5A", vertical: "gadget", cat: "মোবাইল এক্সেসরিজ", sub: "ইয়ারবাড", desc: "ANC/ENC, টাচ কন্ট্রোল, লং ব্যাটারি।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/09/4501F450-166C-4DF4-BB39-5304544053BE.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/09/IMG_1469.avif" },
  { id: 402, title: "QCY PB20A ২০০০০mAh", author: "Tech Jhuli", unit: "১ পিস", price: 1890, old: 2290, sold: 160, color: "#245A6B", vertical: "gadget", cat: "মোবাইল এক্সেসরিজ", sub: "পাওয়ার ব্যাংক", desc: "৪৫W PD ফাস্ট চার্জ, দুই পোর্ট।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/08/D2000A52-6E61-471C-A625-5D33E96E6C55-copy.jpg", image2: "https://techjhuli.com/wp-content/uploads/2026/08/IMG_9621.jpg" },
  { id: 403, title: "Hollyland Lark M2S", author: "Tech Jhuli", unit: "১ সেট", price: 2490, old: 2890, sold: 140, color: "#1F4A3A", vertical: "gadget", cat: "স্মার্ট গ্যাজেট", sub: "মাইক", desc: "ওয়্যারলেস ল্যাভালিয়ার মাইক — কন্টেন্ট ও কল।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/08/318BA3BA-3A90-4627-AB55-302C6C32C853.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/08/imageye___-_imgi_145_Group102-pe.jpg" },
  { id: 404, title: "X10 লেজার ফ্ল্যাশলাইট", author: "Tech Jhuli", unit: "১ পিস", price: 990, old: 1290, sold: 190, color: "#4A2744", vertical: "gadget", cat: "স্মার্ট গ্যাজেট", sub: "ফ্ল্যাশলাইট", desc: "হাই পাওয়ার টর্চ, জুম ফোকাস।", stock: 0, image: "https://techjhuli.com/wp-content/uploads/2026/08/9418D9EE-D585-4F96-A051-0DCF53D4F201.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/08/IMG_9791.avif" },
  { id: 405, title: "SKE POE 432P Mini UPS", author: "Tech Jhuli", unit: "১ পিস", price: 4290, old: 4790, sold: 95, color: "#2C3A5A", vertical: "gadget", cat: "কম্পিউটার", sub: "Mini UPS", desc: "৫V/৯V/১২V ও PoE — রাউটার ব্যাকআপ।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/09/AF3DF6A1-4605-4C70-AC92-F5319BAD1740.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/09/IMG_2016.avif" },
  { id: 406, title: "SKE POE 36E LFP UPS", author: "Tech Jhuli", unit: "১ পিস", price: 3650, old: 0, sold: 230, color: "#1C3A5A", vertical: "gadget", cat: "কম্পিউটার", sub: "DC UPS", desc: "LiFePO৪ মিনি DC UPS — ওয়াইফাই ব্যাকআপ।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/08/B7E1A1A2-B767-472D-9AD8-58F2B12A3862.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/08/IMG_0681.jpg" },
  { id: 407, title: "Weidasi WD-959 মশারি ব্যাট", author: "Tech Jhuli", unit: "১ পিস", price: 780, old: 950, sold: 175, color: "#C4A15A", vertical: "gadget", cat: "হোম", sub: "মশারি ব্যাট", desc: "রিচার্জেবল মশারি মারার ব্যাট, LED লাইট।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/08/BA11A1F0-6351-47FA-861C-5DF9AE95AD51.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/08/IMG_0145.avif" },
  { id: 408, title: "Iwin IW8038 ডেস্ক ফ্যান", author: "Tech Jhuli", unit: "১ পিস", price: 1890, old: 0, sold: 340, color: "#6B3A1F", vertical: "gadget", cat: "হোম", sub: "ফ্যান", desc: "টার্বো ডেস্ক ফ্যান — পড়ার টেবিলের জন্য।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/08/0726ED6E-B790-476A-815C-AD81D5676281.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/08/IMG_1009.avif" },
  { id: 409, title: "Weidasi WD-289 Remote", author: "Tech Jhuli", unit: "১ পিস", price: 3590, old: 4090, sold: 88, color: "#2C3A5A", vertical: "gadget", cat: "হোম", sub: "ফ্যান", desc: "রিচার্জেবল স্ট্যান্ড ফ্যান, রিমোট কন্ট্রোল।", stock: 12, image: "https://techjhuli.com/wp-content/uploads/2026/09/521A5181-D00A-4F69-8FFA-1F2BED7015F5.avif", image2: "https://techjhuli.com/wp-content/uploads/2026/09/IMG_1878.avif" },
];

export const catalog: Catalog = {
  products,
  packs: [
    { id: 101, title: "এসএসসি প্যাকেজ", price: 1490, old: 1570, bookIds: [3, 4], desc: "নবম-দশম — পাঞ্জেরী বাংলা ও পদার্থ একসাথে।", vertical: "book" },
    { id: 102, title: "মেডিকেল প্যাকেজ", price: 1150, old: 1360, bookIds: [13, 14], desc: "মেডিকেল ভর্তি — জীববিজ্ঞান ও রসায়ন।", vertical: "book" },
    { id: 103, title: "ভর্তি স্ট্যাক", price: 1290, old: 1900, bookIds: [7, 8, 15], desc: "ইঞ্জিনিয়ারিং গণিত, বুয়েট প্রশ্নব্যাংক ও ব্যাংক গাইড।", vertical: "book" },
  ],
  verticals: VERTICALS,
  slides: {
    book: [
      { cat: "নবম-দশম", kicker: "এসএসসি", title: "নবম-দশম গাইড", sub: "বোর্ড প্রশ্ন ও সাজেশন", img: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1600&q=80" },
      { cat: "ইঞ্জিনিয়ারিং ভর্তি", kicker: "ভর্তি", title: "ইঞ্জিনিয়ারিং প্রস্তুতি", sub: "গণিত ও প্রশ্নব্যাংক", img: "https://images.unsplash.com/photo-14565130808-af29b1fef35b?auto=format&fit=crop&w=1600&q=80" },
      { cat: "মেডিকেল ভর্তি", kicker: "মেডিকেল", title: "মেডিকেল ভর্তি", sub: "বায়োলজি · রসায়ন · পদার্থ", img: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=1600&q=80" },
      { cat: "ব্যাংক প্রস্তুতি", kicker: "চাকরি", title: "ব্যাংক নিয়োগ গাইড", sub: "গাইড · গণিত · ইংরেজি", img: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&q=80" },
    ],
    food: [
      { cat: "তেল ও ঘি", kicker: "সরিষার তেল", title: "দেশি সরিষার তেল", sub: "১ লিটার থেকে ৫ লিটার", img: "https://cdn.ghorerbazar.com/productImages/vkVdH1767248022.jpg" },
      { cat: "মধু", kicker: "সুন্দরবন", title: "সুন্দরবনের মধু", sub: "১ কেজি · খাঁটি", img: "https://cdn.ghorerbazar.com/productImages/KWSqQ1785577173-light-1000x1000.jpg" },
      { cat: "খেজুর", kicker: "আজওয়া", title: "আজওয়া খেজুর", sub: "প্রিমিয়াম ফ্রেশ", img: "https://cdn.ghorerbazar.com/productImages/TY03p1782300772.webp" },
      { cat: "মসলা", kicker: "গুঁড়া", title: "হলুদ · মরিচ · ধনিয়া", sub: "৫০০ গ্রাম প্যাক", img: "https://cdn.ghorerbazar.com/productImages/TNMp41787487432-light-1000x1000.jpg" },
    ],
    gadget: [
      { cat: "হোম", kicker: "হোম", title: "রিচার্জেবল ফ্যান", sub: "রিমোট কন্ট্রোল · পোর্টেবল", img: "https://techjhuli.com/wp-content/uploads/2026/09/521A5181-D00A-4F69-8FFA-1F2BED7015F5.avif" },
      { cat: "মোবাইল এক্সেসরিজ", kicker: "মোবাইল", title: "ইয়ারবাড ও পাওয়ার", sub: "প্রতিদিনের গ্যাজেট", img: "https://techjhuli.com/wp-content/uploads/2026/09/4501F450-166C-4DF4-BB39-5304544053BE.avif" },
      { cat: "স্মার্ট গ্যাজেট", kicker: "স্মার্ট", title: "মাইক ও ফ্ল্যাশলাইট", sub: "অডিও · টর্চ", img: "https://techjhuli.com/wp-content/uploads/2026/08/318BA3BA-3A90-4627-AB55-302C6C32C853.avif" },
      { cat: "কম্পিউটার", kicker: "ডেস্ক", title: "Mini DC UPS", sub: "রাউটার · ল্যাপটপ ব্যাকআপ", img: "https://techjhuli.com/wp-content/uploads/2026/09/AF3DF6A1-4605-4C70-AC92-F5319BAD1740.avif" },
    ],
  },
  ticker: ["চলো, কিনে ফেলি", "বই · ঘরের বাজার · গ্যাজেট এক ঠিকানায়", "সারা বাংলাদেশে হোম ডেলিভারি"],
};

export function verticalById(id: VerticalId) {
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[0];
}
