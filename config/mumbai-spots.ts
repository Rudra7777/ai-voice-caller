export type Spot = {
  name: string; area: string; kind: 'food' | 'activity'
  veg: 'veg' | 'non-veg' | 'both'; budget: 1000 | 2000; note: string
}

export const MUMBAI_SPOTS: Spot[] = [
  // ---- Food ----
  { name: 'Bademiya', area: 'Colaba', kind: 'food', veg: 'non-veg', budget: 1000, note: 'legendary late-night seekh & rolls' },
  { name: 'Britannia & Co.', area: 'Ballard Estate', kind: 'food', veg: 'non-veg', budget: 1000, note: 'iconic Parsi berry pulao' },
  { name: 'Swati Snacks', area: 'Tardeo', kind: 'food', veg: 'veg', budget: 1000, note: 'refined Gujarati street food' },
  { name: 'Ram Ashraya', area: 'Matunga', kind: 'food', veg: 'veg', budget: 1000, note: 'classic South-Indian breakfast' },
  { name: 'Cafe Madras', area: 'Matunga', kind: 'food', veg: 'veg', budget: 1000, note: 'filter coffee & dosa institution' },
  { name: 'Elco Market', area: 'Bandra', kind: 'food', veg: 'veg', budget: 1000, note: 'best pani puri & chaat' },
  { name: 'Soul Fry', area: 'Bandra', kind: 'food', veg: 'non-veg', budget: 1000, note: 'Goan-coastal, buzzing vibe' },
  { name: 'Mohammed Ali Road', area: 'South Mumbai', kind: 'food', veg: 'non-veg', budget: 1000, note: 'street-food crawl, esp. Ramzan' },
  { name: 'Prithvi Cafe', area: 'Juhu', kind: 'food', veg: 'both', budget: 1000, note: 'chai + theatre courtyard charm' },
  { name: 'Gajalee', area: 'Vile Parle', kind: 'food', veg: 'non-veg', budget: 2000, note: 'Malvani seafood, prawns & bombil' },
  { name: 'Pali Village Cafe', area: 'Bandra', kind: 'food', veg: 'both', budget: 2000, note: 'rustic-European, date-night vibe' },
  { name: 'The Bombay Canteen', area: 'Lower Parel', kind: 'food', veg: 'both', budget: 2000, note: 'inventive modern Indian' },
  { name: 'Trishna', area: 'Fort', kind: 'food', veg: 'non-veg', budget: 2000, note: 'famous butter-pepper-garlic crab' },
  { name: 'Bastian', area: 'Worli', kind: 'food', veg: 'non-veg', budget: 2000, note: 'upscale seafood, lively crowd' },
  // ---- Activities ----
  { name: 'Marine Drive sunset walk', area: 'South Mumbai', kind: 'activity', veg: 'both', budget: 1000, note: 'free Queen’s Necklace stroll' },
  { name: 'Carter Road & Bandstand', area: 'Bandra', kind: 'activity', veg: 'both', budget: 1000, note: 'seaside promenade & cafes' },
  { name: 'Kala Ghoda art walk', area: 'Fort', kind: 'activity', veg: 'both', budget: 1000, note: 'galleries & heritage lanes' },
  { name: 'Prithvi Theatre play', area: 'Juhu', kind: 'activity', veg: 'both', budget: 1000, note: 'intimate live theatre' },
  { name: 'Elephanta Caves ferry', area: 'Gateway of India', kind: 'activity', veg: 'both', budget: 2000, note: 'island caves day-trip' },
  { name: 'Kanheri Caves, SGNP', area: 'Borivali', kind: 'activity', veg: 'both', budget: 1000, note: 'forest trail & rock-cut caves' },
]
