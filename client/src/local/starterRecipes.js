// Starter recipes for a fresh phone (same as server/lib/starterRecipes.js).
const en = [
  {
    "name": "Coconut Cream Oats",
    "servingGrams": 250,
    "baseCalsPer100g": 145,
    "proteinPer100g": 5.2,
    "notes": "Coconut cream is 17% fat base. Add toppings separately."
  },
  {
    "name": "Grilled Chicken Breast",
    "servingGrams": 150,
    "baseCalsPer100g": 165,
    "proteinPer100g": 31,
    "notes": "Skinless. Weigh after cooking."
  },
  {
    "name": "Basmati Rice (Cooked)",
    "servingGrams": 150,
    "baseCalsPer100g": 130,
    "proteinPer100g": 2.7,
    "notes": "Cooked weight. 1 cup cooked ≈ 175g."
  },
  {
    "name": "Whey Protein Shake",
    "servingGrams": 30,
    "baseCalsPer100g": 380,
    "proteinPer100g": 75,
    "notes": "Per 100g of powder. 1 scoop ≈ 30g."
  },
  {
    "name": "Greek Yogurt (Low Fat)",
    "servingGrams": 150,
    "baseCalsPer100g": 59,
    "proteinPer100g": 10,
    "notes": "0% or 2% fat. Check label for brand variance."
  },
  {
    "name": "Eggs (Whole, Boiled)",
    "servingGrams": 100,
    "baseCalsPer100g": 155,
    "proteinPer100g": 13,
    "notes": "1 large egg ≈ 50g."
  },
  {
    "name": "Sweet Potato (Baked)",
    "servingGrams": 200,
    "baseCalsPer100g": 90,
    "proteinPer100g": 2,
    "notes": "Without skin. Weigh after baking."
  },
  {
    "name": "Salmon Fillet",
    "servingGrams": 150,
    "baseCalsPer100g": 208,
    "proteinPer100g": 20,
    "notes": "Raw weight. Omega-3 rich, hidden fat — account for it."
  }
];

const he = [
  {
    "name": "שיבולת שועל בקרם קוקוס",
    "servingGrams": 250,
    "baseCalsPer100g": 145,
    "proteinPer100g": 5.2,
    "notes": "קרם קוקוס הוא בסיס של 17% שומן. את התוספות מוסיפים בנפרד."
  },
  {
    "name": "חזה עוף בגריל",
    "servingGrams": 150,
    "baseCalsPer100g": 165,
    "proteinPer100g": 31,
    "notes": "ללא עור. שוקלים אחרי הבישול."
  },
  {
    "name": "אורז בסמטי (מבושל)",
    "servingGrams": 150,
    "baseCalsPer100g": 130,
    "proteinPer100g": 2.7,
    "notes": "משקל מבושל. כוס מבושלת ≈ 175 גר׳."
  },
  {
    "name": "שייק חלבון",
    "servingGrams": 30,
    "baseCalsPer100g": 380,
    "proteinPer100g": 75,
    "notes": "ל-100 גר׳ אבקה. סקופ אחד ≈ 30 גר׳."
  },
  {
    "name": "יוגורט יווני (דל שומן)",
    "servingGrams": 150,
    "baseCalsPer100g": 59,
    "proteinPer100g": 10,
    "notes": "0% או 2% שומן. כדאי לבדוק את התווית לפי המותג."
  },
  {
    "name": "ביצים (שלמות, קשות)",
    "servingGrams": 100,
    "baseCalsPer100g": 155,
    "proteinPer100g": 13,
    "notes": "ביצה גדולה אחת ≈ 50 גר׳."
  },
  {
    "name": "בטטה אפויה",
    "servingGrams": 200,
    "baseCalsPer100g": 90,
    "proteinPer100g": 2,
    "notes": "ללא קליפה. שוקלים אחרי האפייה."
  },
  {
    "name": "פילה סלמון",
    "servingGrams": 150,
    "baseCalsPer100g": 208,
    "proteinPer100g": 20,
    "notes": "משקל גולמי. עשיר באומגה 3, שומן נסתר - כדאי לקחת בחשבון."
  }
];

export const starterRecipes = (lang) => (lang === 'he' ? he : en).map((r) => ({ ...r }));
