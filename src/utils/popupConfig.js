// Helpers for per-menu-item popup (Order Wizard) configuration.
// Popup config used to live on each category; it now lives on each menu item
// (stored as a single JSON column `popupConfig` in the Menu sheet).

// Per-popup field suffixes (1..6) plus the shared hasDining flag.
export const POPUP_NUMS = [1, 2, 3, 4, 5, 6];

const popupFieldKeys = () => {
  const keys = ['hasDining', 'popupConfigured'];
  POPUP_NUMS.forEach(n => {
    keys.push(
      `hasPopup${n}`, `popup${n}Category`, `popup${n}Items`, `popup${n}ItemsMax`,
      `popup${n}Min`, `popup${n}Max`, `popup${n}Free`, `popup${n}AllowRepeat`
    );
  });
  return keys;
};

// Default flattened popup fields for a brand-new menu item.
export const emptyPopupFields = () => {
  const obj = { hasDining: true, popupConfigured: false };
  POPUP_NUMS.forEach(n => {
    obj[`hasPopup${n}`] = false;
    obj[`popup${n}Category`] = '';
    obj[`popup${n}Items`] = [];
    obj[`popup${n}ItemsMax`] = {};
    obj[`popup${n}Min`] = 0;
    obj[`popup${n}Max`] = 0;
    obj[`popup${n}Free`] = false;
    obj[`popup${n}AllowRepeat`] = true; // เลือกซ้ำได้เป็นค่าเริ่มต้น
  });
  return obj;
};

// Merge a stored popupConfig object back onto the flat item (for the wizard/forms).
export const flattenPopupConfig = (item) => {
  if (!item) return item;
  const cfg = item.popupConfig && typeof item.popupConfig === 'object' ? item.popupConfig : {};
  return { ...item, ...cfg };
};

// Collect the flat popup fields off an item into a compact popupConfig object,
// marking it as explicitly configured so the storefront uses item-level config.
export const extractPopupConfig = (item) => {
  const cfg = { popupConfigured: true };
  popupFieldKeys().forEach(k => {
    if (k === 'popupConfigured') return;
    if (item[k] !== undefined) cfg[k] = item[k];
  });
  return cfg;
};

// True when an item has been explicitly given its own popup configuration.
export const hasItemPopupConfig = (food) => !!(food && food.popupConfigured);

// Build the list of selectable price options for a menu item.
// Falls back to the single legacy `price` field when no named prices exist.
export const getPriceOptions = (food) => {
  if (food && Array.isArray(food.prices) && food.prices.length > 0) {
    const opts = food.prices
      .filter(p => p && p.price !== '' && p.price != null)
      .map(p => ({ name: p.name || '', price: Number(p.price) || 0 }));
    if (opts.length > 0) return opts;
  }
  return [{ name: '', price: Number(food && food.price) || 0 }];
};

// Decide which object holds the active popup config for a given food.
// Falls back to the food's category config when the item is not configured,
// so existing category-based setups keep working until items are reconfigured.
export const resolvePopupSource = (food, categories = []) => {
  if (hasItemPopupConfig(food)) return food;
  return categories.find(c => c.slug === food.category) || {};
};

// True when a menu item carries its own popup steps — used to open a nested
// popup when the item is picked inside another item's popup.
export const hasOwnPopupSteps = (item) => {
  if (!item) return false;
  const cfg = flattenPopupConfig(item);
  if (!hasItemPopupConfig(cfg)) return false;
  return POPUP_NUMS.some(n => cfg[`hasPopup${n}`] === true);
};
