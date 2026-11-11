import type { KeyboardEvent } from "react";

/**
 * Шүүлтийн хэсэгт ENTER дарахад хайлт хийнэ.
 *
 * ЯАГААД: хайлтын талбарт бичээд Enter дарахад юу ч болдоггүй, хэрэглэгч
 * заавал "Хайх" товч руу очиж дарах шаардлагатай байв. Энэ нь хүснэгттэй
 * ажилладаг бүх дэлгэц дээр давтагддаг таагүй байдал.
 *
 * ХЭРЭГЛЭХ: шүүлтийн мөрийн ГАДНА талын элемент дээр тарааж тавина —
 * ингэснээр тэр доторх БҮХ талбар (одоогийнх ч, дараа нэмэгдэх ч)
 * автоматаар хамрагдана:
 *
 *     <div className="…" {...searchOnEnter(applySearch)}>
 *       <input … /> <select … /> <button onClick={applySearch}>Хайх</button>
 *     </div>
 *
 * Нэмэлт боодол (wrapper div) үүсгэхгүй тул одоо байгаа flex/grid байрлал
 * өөрчлөгдөхгүй.
 */
export function searchOnEnter(onSearch: () => void) {
  return {
    onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;

      // IME (кирилл/латин хөрвүүлэгч) нь үг баталгаажуулахдаа Enter
      // ашигладаг — тэр үед хайлт эхлүүлбэл хагас бичсэн үгээр хайна.
      if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;

      const el = e.target as HTMLElement | null;
      if (!el) return;

      // Олон мөрт талбарт Enter нь МӨР ТАСЛАХ утгатай.
      if (el.tagName === "TEXTAREA") return;

      // Товч/холбоос дээр Enter нь тэр элементийн өөрийнх нь үйлдэл
      // (жишээ нь "Цэвэрлэх") — түүнийг дарж бичихгүй.
      if (el.tagName === "BUTTON" || el.tagName === "A") return;

      // Нээлттэй сонголтын жагсаалт (combobox) дотор Enter нь сонголт
      // баталгаажуулна; хайлт нь дараагийн Enter дээр явна.
      if (el.getAttribute("aria-expanded") === "true") return;

      e.preventDefault();
      onSearch();
    },
  };
}
