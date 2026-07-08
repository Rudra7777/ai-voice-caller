export type Zone =
  | 'South' | 'Central' | 'Western' | 'Powai'
  | 'Eastern' | 'Navi Mumbai' | 'Thane' | 'Kalyan-Dombivli'

export type Spot = {
  name: string; area: string; zone: Zone; kind: 'food' | 'activity'
  veg: 'veg' | 'non-veg' | 'both'; budget: 1000 | 2000; note: string
}

// Real, recognizable Mumbai spots grouped by zone so Arya can pick 4-5 near the
// caller's area. budget: 1000 = casual/pocket-friendly, 2000 = premium.
// Never let the model invent a place — only recommend from this list.
export const MUMBAI_SPOTS: Spot[] = [
  // ============ SOUTH MUMBAI ============
  { name: 'Bademiya', area: 'Colaba', zone: 'South', kind: 'food', veg: 'non-veg', budget: 1000, note: 'legendary late-night seekh kebabs & rolls' },
  { name: 'Britannia & Co.', area: 'Ballard Estate', zone: 'South', kind: 'food', veg: 'non-veg', budget: 1000, note: 'iconic Parsi berry pulao' },
  { name: 'Kyani & Co.', area: 'Marine Lines', zone: 'South', kind: 'food', veg: 'both', budget: 1000, note: 'old-school Irani cafe, bun-maska & keema' },
  { name: 'K. Rustom', area: 'Churchgate', zone: 'South', kind: 'food', veg: 'veg', budget: 1000, note: 'century-old ice-cream sandwiches' },
  { name: 'Mohammed Ali Road', area: 'South Mumbai', zone: 'South', kind: 'food', veg: 'non-veg', budget: 1000, note: 'street-food crawl, epic during Ramzan' },
  { name: 'Trishna', area: 'Fort', zone: 'South', kind: 'food', veg: 'non-veg', budget: 2000, note: 'famous butter-pepper-garlic crab' },
  { name: 'Marine Drive sunset walk', area: 'Marine Drive', zone: 'South', kind: 'activity', veg: 'both', budget: 1000, note: 'free Queen’s Necklace stroll' },
  { name: 'Kala Ghoda art precinct', area: 'Fort', zone: 'South', kind: 'activity', veg: 'both', budget: 1000, note: 'galleries, cafes & heritage lanes' },
  { name: 'Gateway of India & Elephanta ferry', area: 'Colaba', zone: 'South', kind: 'activity', veg: 'both', budget: 2000, note: 'harbour ferry to island caves' },
  { name: 'Colaba Causeway shopping', area: 'Colaba', zone: 'South', kind: 'activity', veg: 'both', budget: 1000, note: 'buzzy street shopping & cafes' },

  // ============ CENTRAL (Dadar / Matunga / Parel / Worli) ============
  { name: 'Swati Snacks', area: 'Tardeo', zone: 'Central', kind: 'food', veg: 'veg', budget: 1000, note: 'refined Gujarati street food' },
  { name: 'Ram Ashraya', area: 'Matunga', zone: 'Central', kind: 'food', veg: 'veg', budget: 1000, note: 'classic South-Indian breakfast' },
  { name: 'Cafe Madras', area: 'Matunga', zone: 'Central', kind: 'food', veg: 'veg', budget: 1000, note: 'filter coffee & dosa institution' },
  { name: 'Aaswad', area: 'Dadar', zone: 'Central', kind: 'food', veg: 'veg', budget: 1000, note: 'award-winning misal & Maharashtrian' },
  { name: 'The Bombay Canteen', area: 'Lower Parel', zone: 'Central', kind: 'food', veg: 'both', budget: 2000, note: 'inventive modern Indian' },
  { name: 'Bastian', area: 'Worli', zone: 'Central', kind: 'food', veg: 'non-veg', budget: 2000, note: 'upscale seafood, lively crowd' },
  { name: 'Shivaji Park', area: 'Dadar', zone: 'Central', kind: 'activity', veg: 'both', budget: 1000, note: 'iconic maidan, cutting-chai & vada pav' },
  { name: 'Worli Sea Face', area: 'Worli', zone: 'Central', kind: 'activity', veg: 'both', budget: 1000, note: 'breezy seaside promenade' },
  { name: 'Phoenix Palladium', area: 'Lower Parel', zone: 'Central', kind: 'activity', veg: 'both', budget: 2000, note: 'premium mall, cinema & dining' },
  { name: 'Nehru Science Centre', area: 'Worli', zone: 'Central', kind: 'activity', veg: 'both', budget: 1000, note: 'hands-on science museum' },

  // ============ WESTERN SUBURBS (Bandra / Juhu / Andheri / Borivali) ============
  { name: 'Elco Market', area: 'Bandra', zone: 'Western', kind: 'food', veg: 'veg', budget: 1000, note: 'best pani puri & chaat' },
  { name: 'Soul Fry', area: 'Bandra', zone: 'Western', kind: 'food', veg: 'non-veg', budget: 1000, note: 'Goan-coastal, buzzing vibe' },
  { name: 'Candies', area: 'Bandra', zone: 'Western', kind: 'food', veg: 'both', budget: 1000, note: 'quirky all-day cafe, great snacks' },
  { name: 'Pali Village Cafe', area: 'Bandra', zone: 'Western', kind: 'food', veg: 'both', budget: 2000, note: 'rustic-European, date-night vibe' },
  { name: 'Gajalee', area: 'Vile Parle', zone: 'Western', kind: 'food', veg: 'non-veg', budget: 2000, note: 'Malvani seafood, prawns & bombil' },
  { name: 'Prithvi Cafe', area: 'Juhu', zone: 'Western', kind: 'food', veg: 'both', budget: 1000, note: 'chai & theatre courtyard charm' },
  { name: 'Pratap Da Dhaba', area: 'Andheri', zone: 'Western', kind: 'food', veg: 'non-veg', budget: 1000, note: 'hearty Mughlai & tandoor' },
  { name: 'Suraj Lama Momos', area: 'Versova', zone: 'Western', kind: 'food', veg: 'both', budget: 1000, note: 'authentic North-Eastern momos' },
  { name: 'Bandstand & Carter Road', area: 'Bandra', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'seaside promenade & cafes' },
  { name: 'Juhu Beach', area: 'Juhu', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'sunset, chaat & sea breeze' },
  { name: 'ISKCON Juhu', area: 'Juhu', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'serene Krishna temple' },
  { name: 'Versova Beach', area: 'Versova', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'cleaner, calmer beach walk' },
  { name: 'Prithvi Theatre play', area: 'Juhu', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'intimate live theatre' },
  { name: 'Infiniti Mall', area: 'Malad', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'shopping, food & cinema' },
  { name: 'Kanheri Caves, SGNP', area: 'Borivali', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'forest trail & rock-cut caves' },
  { name: 'Global Vipassana Pagoda', area: 'Gorai', zone: 'Western', kind: 'activity', veg: 'both', budget: 1000, note: 'golden dome & meditation by the sea' },

  // ============ POWAI ============
  { name: 'Mirchi & Mime', area: 'Powai', zone: 'Powai', kind: 'food', veg: 'both', budget: 2000, note: 'fine Indian, served by deaf staff' },
  { name: 'The Finch', area: 'Powai', zone: 'Powai', kind: 'food', veg: 'non-veg', budget: 2000, note: 'jazz resto-bar, global plates' },
  { name: 'Origami', area: 'Powai', zone: 'Powai', kind: 'food', veg: 'both', budget: 2000, note: 'minimalist Japanese & sushi' },
  { name: 'Powai Lake promenade', area: 'Powai', zone: 'Powai', kind: 'activity', veg: 'both', budget: 1000, note: 'lakeside walk & cafes' },

  // ============ EASTERN SUBURBS (Ghatkopar / Chembur) ============
  { name: 'Ghatkopar Khau Galli', area: 'Ghatkopar', zone: 'Eastern', kind: 'food', veg: 'veg', budget: 1000, note: 'famous veg street-food lane' },
  { name: 'The Golden Wok', area: 'Chembur', zone: 'Eastern', kind: 'food', veg: 'non-veg', budget: 2000, note: 'well-loved Chinese & seafood' },
  { name: 'Singh Saab', area: 'Chembur', zone: 'Eastern', kind: 'food', veg: 'non-veg', budget: 1000, note: 'authentic North-Indian' },
  { name: 'R City Mall', area: 'Ghatkopar', zone: 'Eastern', kind: 'activity', veg: 'both', budget: 1000, note: 'big mall, cinema & food court' },
  { name: 'Diamond Garden', area: 'Chembur', zone: 'Eastern', kind: 'activity', veg: 'both', budget: 1000, note: 'leafy park & evening snack stalls' },

  // ============ NAVI MUMBAI (Vashi / Nerul / Kharghar / Belapur) ============
  { name: 'Mahesh Lunch Home', area: 'Vashi', zone: 'Navi Mumbai', kind: 'food', veg: 'non-veg', budget: 2000, note: 'legendary Mangalorean seafood' },
  { name: 'Bhagat Tarachand', area: 'Vashi', zone: 'Navi Mumbai', kind: 'food', veg: 'veg', budget: 1000, note: 'hearty Marwari-Rajasthani thali' },
  { name: 'Malvan Tadka', area: 'CBD Belapur', zone: 'Navi Mumbai', kind: 'food', veg: 'non-veg', budget: 1000, note: 'fiery Malvani seafood' },
  { name: 'Village - The Soul of India', area: 'Kharghar', zone: 'Navi Mumbai', kind: 'food', veg: 'veg', budget: 2000, note: 'rustic village-themed veg dining' },
  { name: 'Barbeque Nation', area: 'Vashi', zone: 'Navi Mumbai', kind: 'food', veg: 'both', budget: 2000, note: 'unlimited live-grill buffet' },
  { name: 'Central Park', area: 'Kharghar', zone: 'Navi Mumbai', kind: 'activity', veg: 'both', budget: 1000, note: 'one of Asia’s largest urban parks' },
  { name: 'Wonders Park', area: 'Nerul', zone: 'Navi Mumbai', kind: 'activity', veg: 'both', budget: 1000, note: 'seven-wonders replicas & lake' },
  { name: 'Kharghar Hills & Pandavkada Falls', area: 'Kharghar', zone: 'Navi Mumbai', kind: 'activity', veg: 'both', budget: 1000, note: 'hill views & monsoon waterfall' },

  // ============ THANE ============
  { name: 'Asia Kitchen by Mainland China', area: 'Thane', zone: 'Thane', kind: 'food', veg: 'both', budget: 2000, note: 'polished pan-Asian' },
  { name: 'The Exotica', area: 'Yeoor Hills', zone: 'Thane', kind: 'food', veg: 'both', budget: 2000, note: 'jungle-themed, romantic ambience' },
  { name: 'Barbeque Nation', area: 'Thane', zone: 'Thane', kind: 'food', veg: 'both', budget: 2000, note: 'unlimited live-grill buffet' },
  { name: 'Upvan Lake', area: 'Thane', zone: 'Thane', kind: 'activity', veg: 'both', budget: 1000, note: 'scenic lakeside promenade' },
  { name: 'Tikuji-ni-Wadi', area: 'Thane', zone: 'Thane', kind: 'activity', veg: 'both', budget: 2000, note: 'amusement & water park' },
  { name: 'Yeoor Hills', area: 'Thane', zone: 'Thane', kind: 'activity', veg: 'both', budget: 1000, note: 'green hills, trails & nature' },
  { name: 'Korum Mall', area: 'Thane', zone: 'Thane', kind: 'activity', veg: 'both', budget: 1000, note: 'shopping, food & cinema' },

  // ============ KALYAN - DOMBIVLI ============
  { name: 'Super Food Amber Vada Pav', area: 'Kalyan', zone: 'Kalyan-Dombivli', kind: 'food', veg: 'veg', budget: 1000, note: 'Kalyan’s most-loved vada pav & misal' },
  { name: 'Sangam Restaurant', area: 'Kalyan', zone: 'Kalyan-Dombivli', kind: 'food', veg: 'both', budget: 1000, note: 'famous thalis & Maharashtrian' },
  { name: 'Nav Gajanan Vada Pav', area: 'Kalyan', zone: 'Kalyan-Dombivli', kind: 'food', veg: 'veg', budget: 1000, note: 'signature besan-chutney vada pav' },
  { name: 'Kailash Parbat', area: 'Dombivli', zone: 'Kalyan-Dombivli', kind: 'food', veg: 'veg', budget: 1000, note: 'Sindhi chaat & rich veg' },
  { name: 'Kala Talao', area: 'Kalyan', zone: 'Kalyan-Dombivli', kind: 'activity', veg: 'both', budget: 1000, note: 'central lake & evening hangout' },
  { name: 'Durgadi Fort', area: 'Kalyan', zone: 'Kalyan-Dombivli', kind: 'activity', veg: 'both', budget: 1000, note: 'historic fort by the creek' },
]
