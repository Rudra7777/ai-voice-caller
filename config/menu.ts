// Gattu's Chinese — the real printed menu (w.e.f. 20.04.2026).
// This is the ONLY source of dishes and prices. The agent is grounded strictly
// to it and must never invent a dish, size or price.
//
// Half plates: the kitchen serves half portions of Noodles, Rice and Side
// Dishes only; Soups and Starters are single-portion. Half prices are not
// printed — they follow the owner's convention (see halfPrice in lib/menu.ts).
import { halfPrice, type Category, type MenuItem, type Restaurant, type Tag } from '../lib/menu'

export const RESTAURANT: Restaurant = {
  name: "Gattu's Chinese",
  readyEstimateMins: 20,
}

const HALF_CATEGORIES: Category[] = ['Noodles', 'Rice', 'Side Dish']

// Starters and Soups are single-portion — EXCEPT Chicken Lollypop, the one
// Starter the kitchen also serves as a half plate (4 pcs).
const HALF_EXCEPTIONS = new Set(['chicken-lollypop'])

function item(
  id: string, name: string, full: number, veg: boolean,
  category: Category, tags: Tag[] = [],
): MenuItem {
  const hasHalf = HALF_CATEGORIES.includes(category) || HALF_EXCEPTIONS.has(id)
  return {
    id, name, veg, category, tags,
    sizes: hasHalf ? { full, half: halfPrice(full) } : { full },
  }
}

export const MENU: MenuItem[] = [
  // ---- VEG SOUP ----
  item('veg-clear-soup', 'Veg Clear Soup', 120, true, 'Soup'),
  item('veg-sweet-corn-soup', 'Veg Sweet Corn Soup', 140, true, 'Soup', ['sweet', 'popular']),
  item('veg-manchow-soup', 'Veg Manchow Soup', 140, true, 'Soup', ['bestseller', 'spicy']),
  item('veg-hot-n-sour-soup', "Veg Hot 'n' Sour Soup", 140, true, 'Soup', ['spicy']),
  item('veg-talumein-soup', 'Veg Talumein Soup', 140, true, 'Soup'),
  item('veg-noodle-soup', 'Veg Noodle Soup', 140, true, 'Soup'),
  item('veg-lung-fung-soup', 'Veg Lung Fung Soup (egg)', 160, true, 'Soup'),
  item('veg-pretty-flora-soup', 'GC Pretty Flora Special Soup (veg)', 160, true, 'Soup', ['chef-special']),
  item('veg-cocktail-soup', 'Veg Cocktail Soup', 160, true, 'Soup'),

  // ---- CHICKEN SOUP ----
  item('chicken-clear-soup', 'Chicken Clear Soup', 150, false, 'Soup'),
  item('chicken-sweet-corn-soup', 'Chicken Sweet Corn Soup', 150, false, 'Soup', ['sweet', 'popular']),
  item('chicken-manchow-soup', 'Chicken Manchow Soup', 150, false, 'Soup', ['bestseller', 'spicy']),
  item('chicken-hot-n-sour-soup', "Chicken Hot 'n' Sour Soup", 150, false, 'Soup', ['spicy']),
  item('chicken-talumein-soup', 'Chicken Talumein Soup', 150, false, 'Soup'),
  item('chicken-noodle-soup', 'Chicken Noodle Soup', 150, false, 'Soup'),
  item('chicken-lung-fung-soup', 'Chicken Lung Fung Soup (egg)', 160, false, 'Soup'),
  item('chicken-pretty-flora-soup', 'GC Pretty Flora Special Soup (chicken)', 160, false, 'Soup', ['chef-special']),
  item('chicken-cocktail-soup', 'Chicken Cocktail Soup', 160, false, 'Soup'),

  // ---- VEG STARTER ----
  item('veg-spring-roll', 'Veg Spring Roll', 180, true, 'Starter', ['popular']),
  item('veg-bhel', 'Veg Bhel', 180, true, 'Starter'),
  item('paneer-finger', 'Paneer Finger', 300, true, 'Starter'),
  item('veg-crispy', 'Veg Crispy', 200, true, 'Starter'),
  item('paneer-crispy', 'Paneer Crispy', 300, true, 'Starter', ['popular']),

  // ---- CHICKEN STARTER ----
  item('chicken-spring-roll', 'Chicken Spring Roll', 200, false, 'Starter', ['popular']),
  item('chicken-finger', 'Chicken Finger', 200, false, 'Starter'),
  item('chicken-lollypop', 'Chicken Lollypop (8 pcs)', 200, false, 'Starter', ['bestseller']),
  item('chicken-bhel', 'Chicken Bhel', 200, false, 'Starter'),
  item('chicken-crispy', 'Chicken Crispy', 300, false, 'Starter', ['popular']),
  item('chicken-lollypop-dry-chilli', 'Chicken Lollypop Dry Chilli', 350, false, 'Starter', ['spicy', 'popular']),
  item('diced-dry-chilli', 'Diced Dry Chilli Chicken', 300, false, 'Starter', ['spicy']),
  item('roasted-chicken-dry', 'Roasted Chicken Dry', 300, false, 'Starter'),
  item('chicken-wanton-fried', 'Chicken Wanton (Fried)', 300, false, 'Starter'),
  item('crispy-thread-chicken', 'Crispy Thread Chicken', 300, false, 'Starter'),
  item('chicken-black-pepper', 'Chicken in Black Pepper / Black Bean / Hunan', 300, false, 'Starter', ['spicy']),
  item('papper-chicken', 'Papper Chicken', 300, false, 'Starter', ['spicy']),

  // ---- VEG NOODLES ----
  item('veg-hakka-noodles', 'Veg Hakka Noodles', 190, true, 'Noodles', ['bestseller']),
  item('veg-singapore-noodles', 'Veg Singapore Noodles', 200, true, 'Noodles'),
  item('veg-szechwan-noodles', 'Veg Szechwan Noodles', 200, true, 'Noodles', ['spicy', 'popular']),
  item('veg-chowmein', 'Veg Chowmein', 200, true, 'Noodles', ['popular']),
  item('veg-american-chopsuey', 'Veg American Chopsuey', 200, true, 'Noodles', ['sweet']),
  item('veg-chinese-chopsuey', 'Veg Chinese Chopsuey', 200, true, 'Noodles'),
  item('veg-szechwan-chopsuey', 'Veg Szechwan Chopsuey', 200, true, 'Noodles', ['spicy']),
  item('veg-special-noodles', 'Veg Special Noodles', 260, true, 'Noodles', ['chef-special']),
  item('veg-tripal-szechwan-noodles', 'Veg Tripal Szechwan Noodles', 260, true, 'Noodles', ['spicy']),
  item('veg-manchurian-noodles', 'Veg Manchurian Noodles', 260, true, 'Noodles', ['bestseller']),
  item('paneer-chowmein', 'Paneer Chowmein', 300, true, 'Noodles'),
  item('paneer-american-chopsuey', 'Paneer American Chopsuey', 300, true, 'Noodles', ['sweet']),
  item('paneer-chinese-chopsuey', 'Paneer Chinese Chopsuey', 300, true, 'Noodles'),

  // ---- CHICKEN NOODLES ----
  item('chicken-hakka-noodles', 'Chicken Hakka Noodles', 200, false, 'Noodles', ['bestseller']),
  item('chicken-singapore-noodles', 'Chicken Singapore Noodles', 220, false, 'Noodles'),
  item('chicken-szechwan-noodles', 'Chicken Szechwan Noodles', 220, false, 'Noodles', ['spicy', 'popular']),
  item('chicken-chowmein', 'Chicken Chowmein', 220, false, 'Noodles', ['popular']),
  item('chicken-american-chopsuey', 'Chicken American Chopsuey', 220, false, 'Noodles', ['sweet']),
  item('chicken-chinese-chopsuey', 'Chicken Chinese Chopsuey', 220, false, 'Noodles'),
  item('chicken-szechwan-chopsuey', 'Chicken Szechwan Chopsuey', 250, false, 'Noodles', ['spicy']),
  item('gattus-special-noodles', "Gattu's Special Noodles", 300, false, 'Noodles', ['chef-special']),
  item('chicken-tripal-noodles', 'Chicken Tripal Noodles', 300, false, 'Noodles'),
  item('chicken-manchurian-noodles', 'Chicken Manchurian Noodles', 300, false, 'Noodles', ['bestseller']),

  // ---- VEG RICE ----
  item('veg-fried-rice', 'Veg Fried Rice', 180, true, 'Rice', ['bestseller']),
  item('veg-singapore-rice', 'Veg Singapore Rice', 200, true, 'Rice'),
  item('veg-szechwan-rice', 'Veg Szechwan Rice', 200, true, 'Rice', ['spicy', 'popular']),
  item('veg-hong-kong-rice', 'Veg Hong Kong Rice', 200, true, 'Rice'),
  item('veg-shangai-rice', 'Veg Shangai Rice', 200, true, 'Rice'),
  item('veg-combination-rice', 'Veg Combination Rice', 190, true, 'Rice'),
  item('veg-ginger-rice', 'Veg Ginger Rice', 200, true, 'Rice'),
  item('veg-stewed-rice', 'Veg Stewed Rice', 200, true, 'Rice'),
  item('veg-tripal-szechwan-rice', 'Veg Tripal Szechwan Rice', 260, true, 'Rice', ['spicy']),
  item('gattus-special-rice-veg', "Gattu's Special Rice (veg)", 260, true, 'Rice', ['chef-special']),
  item('veg-lakhpati-rice', 'Veg Lakhpati Rice', 260, true, 'Rice'),
  item('veg-manchurian-rice', 'Veg Manchurian Rice', 260, true, 'Rice', ['bestseller']),
  item('paneer-special-rice', 'Paneer Special Rice', 320, true, 'Rice'),
  item('paneer-sz-lakhpati-rice', 'Paneer Szechwan Lakhpati Rice', 340, true, 'Rice', ['spicy']),
  item('paneer-sz-special-rice', 'Paneer Szechwan Special Rice', 340, true, 'Rice', ['spicy']),
  item('paneer-sz-manchurian-rice', 'Paneer Szechwan Manchurian Rice', 340, true, 'Rice', ['spicy']),

  // ---- CHICKEN / EGG RICE ----
  item('egg-rice', 'Egg Rice', 190, false, 'Rice'),
  item('chicken-fried-rice', 'Chicken Fried Rice', 200, false, 'Rice', ['bestseller']),
  item('chicken-singapore-rice', 'Chicken Singapore Rice', 220, false, 'Rice'),
  item('chicken-szechwan-rice', 'Chicken Szechwan Rice', 220, false, 'Rice', ['spicy', 'popular']),
  item('chicken-hong-kong-rice', 'Chicken Hong Kong Rice', 220, false, 'Rice'),
  item('chicken-combination-rice', 'Chicken Combination Rice', 220, false, 'Rice'),
  item('chicken-ginger-rice', 'Chicken Ginger Rice', 220, false, 'Rice'),
  item('chicken-stewed-rice', 'Chicken Stewed Rice', 290, false, 'Rice'),
  item('chicken-tripal-szechwan-rice', 'Chicken Tripal Szechwan Rice', 300, false, 'Rice', ['spicy']),
  item('gattus-special-rice-chicken', "Gattu's Special Rice (chicken)", 300, false, 'Rice', ['chef-special']),
  item('chicken-lakhpati-rice', 'Chicken Lakhpati Rice', 300, false, 'Rice'),
  item('chicken-manchurian-rice', 'Chicken Manchurian Rice', 300, false, 'Rice', ['bestseller']),
  item('chicken-sz-lakhpati-rice', 'Chicken Szechwan Lakhpati Rice', 320, false, 'Rice', ['spicy']),
  item('gattus-sz-special-rice', "Gattu's Szechwan Special Rice", 320, false, 'Rice', ['chef-special', 'spicy']),
  item('chicken-sz-manchurian-rice', 'Chicken Szechwan Manchurian Rice', 320, false, 'Rice', ['spicy']),

  // ---- VEG SIDE DISHES (gravy & dry) ----
  item('veg-manchurian', 'Veg Manchurian', 190, true, 'Side Dish', ['bestseller']),
  item('veg-chilly-sauce', 'Veg Chilly Sauce', 190, true, 'Side Dish', ['spicy']),
  item('veg-szechwan-sauce', 'Veg in Szechwan Sauce', 190, true, 'Side Dish', ['spicy']),
  item('veg-garlic', 'Veg in Garlic', 190, true, 'Side Dish'),
  item('veg-hot-garlic', 'Veg in Hot Garlic', 190, true, 'Side Dish', ['spicy']),
  item('veg-sweet-sour', 'Veg in Sweet & Sour', 200, true, 'Side Dish', ['sweet', 'popular']),
  item('veg-chow-chow', 'Veg Chow Chow', 200, true, 'Side Dish'),
  item('veg-hong-kong', 'Veg Hong Kong', 200, true, 'Side Dish'),
  item('veg-mangolian', 'Veg Mangolian', 200, true, 'Side Dish'),
  item('gattus-special-veg', "Gattu's Special Veg", 220, true, 'Side Dish', ['chef-special']),
  item('veg-lakhpati', 'Veg Lakhpati', 220, true, 'Side Dish'),
  item('paneer-manchurian', 'Paneer Manchurian', 290, true, 'Side Dish', ['bestseller']),
  item('paneer-chilly-sauce', 'Paneer Chilly Sauce', 290, true, 'Side Dish', ['spicy', 'popular']),
  item('paneer-szechwan-sauce', 'Paneer Szechwan Sauce', 290, true, 'Side Dish', ['spicy']),
  item('paneer-garlic-sauce', 'Paneer Garlic Sauce', 290, true, 'Side Dish'),
  item('paneer-mangolian', 'Paneer Mangolian', 300, true, 'Side Dish'),
  item('paneer-special', 'Paneer Special', 300, true, 'Side Dish', ['chef-special']),
  item('paneer-lakhpati', 'Paneer Lakhpati', 300, true, 'Side Dish'),

  // ---- CHICKEN SIDE DISHES (gravy & dry) ----
  item('chicken-manchurian', 'Chicken Manchurian', 220, false, 'Side Dish', ['bestseller']),
  item('chicken-chilly-sauce', 'Chicken Chilly Sauce', 240, false, 'Side Dish', ['spicy', 'popular']),
  item('chicken-szechwan', 'Chicken in Szechwan', 240, false, 'Side Dish', ['spicy']),
  item('chicken-garlic', 'Chicken in Garlic', 240, false, 'Side Dish'),
  item('chicken-hot-garlic', 'Chicken in Hot Garlic', 240, false, 'Side Dish', ['spicy']),
  item('chicken-sweet-sour', 'Chicken in Sweet & Sour', 240, false, 'Side Dish', ['sweet', 'popular']),
  item('chicken-chow-chow', 'Chicken Chow Chow', 240, false, 'Side Dish'),
  item('chicken-mangolian', 'Chicken Mangolian', 300, false, 'Side Dish'),
  item('gattus-chicken-special', "Gattu's Chicken Special", 300, false, 'Side Dish', ['chef-special']),
  item('chicken-lollypop-gravy', 'Chicken Lollypop Gravy', 350, false, 'Side Dish', ['popular']),
]
