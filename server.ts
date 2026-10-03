import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize Gemini SDK with telemetry header if key is available
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
  try {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Gemini SDK initialization note:', err);
  }
}

// -------------------------------------------------------------
// POST /api/ai/chat - Contextual ServiGo Assistant
// -------------------------------------------------------------
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { query, budget = 10000, context = '' } = req.body;
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  // If real Gemini is configured, use it
  if (ai) {
    try {
      const systemInstruction = `You are the ServiGo Contextual Assistant for the ServiGo – Unified Tertiary Services Platform in Cyber Hub, Gurugram.
ServiGo unifies Hospitality (Hotels, Dining, Cafes, Banquets), Retail (Market Price Comparison across partner stores like Cyber Hub Apparel Co, Metro Threads Galleria, Downtown Fashion Plaza, Cyber City Gadget Hub, Horizon Electronics), Entertainment (Skyfall Laser Tag/VR, LOL Comedy Club, PVR Cinema, Mystery Escape Room), and Financial Expense & Budget Tracking.

Current user monthly safe budget remaining: ₹${Number(budget).toLocaleString('en-IN')}.
Catalog details:
- Black T-Shirt: Lowest price at Metro Threads Galleria (Shop B) for ₹599 (2.2 km). Cyber Hub Apparel Co is ₹699 (1.5 km). Downtown Fashion Plaza is ₹749 (0.8 km).
- Slim Fit Denim Jeans: ₹1,499 at Metro Threads Galleria, ₹1,599 at Cyber Hub Apparel Co.
- Classic White Sneakers: ₹1,899 at Downtown Fashion Plaza.
- Denim Jacket: ₹2,199 at Metro Threads Galleria.
- Skyfall VR Combat Pass: ₹499 (Cyber Hub Level 2).
- Laugh Out Loud Comedy Club: ₹599 (Sector 29).
- Farzi Cafe & Bistro: ₹1,600 for two (0.6 km).
- Roastery Coffee House: ₹450 for coffee & dessert (2.4 km).
- Cancellations: Cancel anytime under Bookings & Orders before reservation cutoff for instant refund.

Answer clearly and concisely (2-4 sentences max). Suggest specific actions if relevant. Do NOT pretend to be a general chatbot. Focus strictly on ServiGo services.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: query,
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      });

      const replyText = response.text || '';
      if (replyText.trim()) {
        let suggestedAction = undefined;
        const qLower = query.toLowerCase();
        if (qLower.includes('t-shirt') || qLower.includes('retail') || qLower.includes('compare') || qLower.includes('cheapest')) {
          suggestedAction = { label: 'Compare Retail Deals', path: '/user/retail' };
        } else if (qLower.includes('cancel') || qLower.includes('booking') || qLower.includes('order')) {
          suggestedAction = { label: 'Go to Bookings & Orders', path: '/user/bookings' };
        } else if (qLower.includes('budget') || qLower.includes('plan') || qLower.includes('1000')) {
          suggestedAction = { label: 'Plan My Experience', path: '/user/plan-experience' };
        } else if (qLower.includes('food') || qLower.includes('dining') || qLower.includes('cafe') || qLower.includes('hotel')) {
          suggestedAction = { label: 'Explore Dining', path: '/user/hospitality' };
        }

        return res.json({
          id: `ai-chat-${Date.now()}`,
          sender: 'assistant',
          text: replyText.trim(),
          timestamp,
          suggestedAction,
          isAIGenerated: true,
        });
      }
    } catch (apiErr) {
      console.warn('Gemini chat error, falling back to deterministic response:', apiErr);
    }
  }

  // Graceful rule-based fallback
  const q = query.toLowerCase();
  let text = `I am your ServiGo intelligent assistant. You can ask me to find the cheapest options, check prices within your ₹${Number(budget).toLocaleString('en-IN')} budget, locate nearby cafes, or guide booking cancellations.`;
  let suggestedAction = { label: 'Explore Services', path: '/user/explore' };

  if (q.includes('cheapest') || q.includes('lowest price')) {
    text = 'The cheapest apparel item is the Premium Cotton Black T-shirt at Metro Threads Galleria (Shop B) for ₹599 (2.2 km). For leisure, Skyfall VR Arena is just ₹499.';
    suggestedAction = { label: 'Compare T-Shirts', path: '/user/retail' };
  } else if (q.includes('1000') || q.includes('under 1000') || q.includes('within budget')) {
    text = `Available options under ₹1,000 near Cyber Hub:\n• Cotton Black T-Shirt (₹599 at Shop B)\n• Skyfall VR Arena Pass (₹499)\n• Smart Stainless Vacuum Flask (₹799 at Galleria)\n• Roastery Coffee & Bites (₹450)\nAll comfortably fit your remaining budget of ₹${Number(budget).toLocaleString('en-IN')}.`;
    suggestedAction = { label: 'Plan My Experience', path: '/user/plan-experience' };
  } else if (q.includes('cancel') || q.includes('cancellation') || q.includes('refund')) {
    text = 'You can cancel any Upcoming booking directly from your "Bookings & Orders" tab with one click. Cancellations are processed immediately with full refund confirmation.';
    suggestedAction = { label: 'Go to Bookings & Orders', path: '/user/bookings' };
  } else if (q.includes('closest') || q.includes('nearest') || q.includes('distance')) {
    text = 'The nearest partner spots to Cyber Hub are Farzi Cafe & Bistro (0.6 km) and Downtown Fashion Plaza (0.8 km with 30-min express store pickup).';
    suggestedAction = { label: 'View Nearby Services', path: '/user/hospitality' };
  } else if (q.includes('recommend') || q.includes('similar')) {
    text = `Based on your recent interest in casual wear and dining, we recommend pairing the Metro Threads Black T-shirt (₹599) with an evening beverage at Roastery Coffee House (₹450). Total spend is ₹1,049, safely within your budget.`;
    suggestedAction = { label: 'View Recommendations', path: '/user/dashboard' };
  }

  return res.json({
    id: `chat-${Date.now()}`,
    sender: 'assistant',
    text,
    timestamp,
    suggestedAction,
    isAIGenerated: false,
    isDemoFallback: true,
  });
});

// -------------------------------------------------------------
// POST /api/ai/recommendations - Personalized Recommendations
// -------------------------------------------------------------
app.post('/api/ai/recommendations', async (req: Request, res: Response) => {
  const { budgetRemaining = 1300, searchHistory = [], preferences = [] } = req.body;

  if (ai) {
    try {
      const prompt = `Generate 4 personalized tertiary service recommendations for a user in Cyber Hub Gurugram with a remaining safe monthly budget of ₹${budgetRemaining}.
Search history: ${JSON.stringify(searchHistory)}
Preferences: ${JSON.stringify(preferences)}

Available catalog options to choose or adapt from:
1. Premium Combed Cotton Crew Black T-Shirt (Metro Threads Galleria, ₹599, rating 4.8, category Apparel & Fashion, image https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80)
2. Roastery Cold Brew Blend & Artisanal Muffin (Roastery Coffee House, ₹450, rating 4.9, category Cafes & Dining, image https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80)
3. Skyfall Arena: Tactical VR Combat Session (Skyfall Arena Arcade, ₹499, rating 4.9, category Entertainment, image https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80)
4. Wireless ANC Over-Ear Headphones (Horizon Electronics, ₹3299, rating 4.7, category Consumer Electronics, image https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80)
5. Slim Fit Stretch Denim Jeans (Metro Threads Galleria, ₹1499, rating 4.7, category Apparel & Fashion, image https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=800&q=80)

Return a strict JSON array of 4 items with structure:
[
  {
    "id": "ai-rec-1",
    "title": "string",
    "shop": "string",
    "price": number,
    "rating": number,
    "category": "string",
    "image": "string",
    "reason": "short explainable reason mentioning category or budget",
    "fitsBudget": boolean,
    "matchScore": number
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const parsed = JSON.parse(response.text || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json({ recommendations: parsed, isAIGenerated: true });
      }
    } catch (err) {
      console.warn('Gemini recommendations error, falling back:', err);
    }
  }

  // Fallback
  return res.json({
    recommendations: [
      {
        id: 'ai-rec-1',
        title: 'Premium Combed Cotton Crew Black T-Shirt',
        shop: 'Metro Threads Galleria (Shop B)',
        price: 599,
        rating: 4.8,
        category: 'Apparel & Fashion',
        image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
        reason: `Recommended because it matches your recent search for casual clothing and safely fits within your ₹${Number(budgetRemaining).toLocaleString('en-IN')} remaining budget.`,
        fitsBudget: 599 <= budgetRemaining,
        matchScore: 98,
      },
      {
        id: 'ai-rec-2',
        title: 'Roastery Cold Brew Blend & Artisanal Muffin',
        shop: 'Roastery Coffee House, Sector 29',
        price: 450,
        rating: 4.9,
        category: 'Cafes & Dining',
        image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
        reason: 'Matches your preference for Specialty Coffee; located just 2.4 km from Cyber Hub.',
        fitsBudget: 450 <= budgetRemaining,
        matchScore: 94,
      },
      {
        id: 'ai-rec-3',
        title: 'Skyfall Arena: Tactical VR Combat Session',
        shop: 'Skyfall Arena Arcade, Cyber Hub',
        price: 499,
        rating: 4.9,
        category: 'Entertainment',
        image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
        reason: 'Popular weekend leisure activity under ₹500 with instant pass delivery.',
        fitsBudget: 499 <= budgetRemaining,
        matchScore: 91,
      },
      {
        id: 'ai-rec-4',
        title: 'Wireless ANC Over-Ear Headphones (Pro Sound)',
        shop: 'Horizon Electronics Sector 29',
        price: 3299,
        rating: 4.7,
        category: 'Consumer Electronics',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
        reason: `Trending tech gadget near Cyber Hub. Note: Exceeds your current monthly safe balance of ₹${Number(budgetRemaining).toLocaleString('en-IN')}.`,
        fitsBudget: 3299 <= budgetRemaining,
        matchScore: 82,
      },
    ],
    isAIGenerated: false,
    isDemoFallback: true,
  });
});

// -------------------------------------------------------------
// POST /api/ai/comparison-summary - AI Comparison Summary
// -------------------------------------------------------------
app.post('/api/ai/comparison-summary', async (req: Request, res: Response) => {
  const { product, shops = [] } = req.body;

  if (!shops || shops.length === 0) {
    return res.json({
      bestOverall: 'N/A',
      lowestPriceShop: { name: 'N/A', price: 0, diff: 0 },
      nearestShop: { name: 'N/A', distance: 'N/A' },
      summaryText: 'Insufficient comparison data available.',
    });
  }

  const sortedByPrice = [...shops].sort((a: any, b: any) => a.price - b.price);
  const lowest = sortedByPrice[0];
  const highest = sortedByPrice[sortedByPrice.length - 1];
  const diff = highest.price - lowest.price;

  const sortedByDistance = [...shops].sort((a: any, b: any) => parseFloat(a.distance) - parseFloat(b.distance));
  const nearest = sortedByDistance[0];

  let summaryText = lowest.shopId === nearest.shopId
    ? `${lowest.shopName} offers both the best price (₹${lowest.price.toLocaleString('en-IN')}) and is nearest to you (${lowest.distance}).`
    : `${lowest.shopName} has the lowest price at ₹${lowest.price.toLocaleString('en-IN')} (saving ₹${diff} vs highest), while ${nearest.shopName} is closest (${nearest.distance}) with ${nearest.deliveryOption}.`;

  if (ai) {
    try {
      const prompt = `Summarize in 1-2 factual sentences the retail comparison for product "${product?.name || 'Item'}":
Shops compared: ${JSON.stringify(shops)}
Lowest price shop: ${lowest.shopName} at ₹${lowest.price}
Nearest shop: ${nearest.shopName} at ${nearest.distance}
Max savings: ₹${diff}
Do not invent facts. Focus on price difference and proximity.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { temperature: 0.2 },
      });

      const aiText = response.text?.trim();
      if (aiText) summaryText = aiText;
    } catch (e) {
      // Fallback to computed text
    }
  }

  return res.json({
    bestOverall: lowest.shopName,
    lowestPriceShop: { name: lowest.shopName, price: lowest.price, diff },
    nearestShop: { name: nearest.shopName, distance: nearest.distance },
    summaryText,
    whyThis: 'Based on actual price differences and distance from the selected options.',
  });
});

// -------------------------------------------------------------
// POST /api/ai/product-recommendations - Product Related Recommendations & Budget Check
// -------------------------------------------------------------
app.post('/api/ai/product-recommendations', async (req: Request, res: Response) => {
  const { productName = 'Black T-Shirt', category = 'Apparel & Fashion', budgetRemaining = 2000 } = req.body;

  // Real products available in ServiGo catalog
  const catalog = [
    {
      id: 'ret-5',
      name: 'Slim Fit Stretch Denim Jeans',
      category: 'Apparel & Fashion',
      price: 1499,
      rating: 4.7,
      shop: 'Metro Threads Galleria (Shop B)',
      image: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=800&q=80',
      reason: 'Pairs naturally with casual t-shirts and daily city wear.',
    },
    {
      id: 'ret-6',
      name: 'Classic Low-Top White Sneakers',
      category: 'Apparel & Fashion',
      price: 1899,
      rating: 4.8,
      shop: 'Downtown Fashion Plaza (Shop C)',
      image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80',
      reason: 'Frequently paired with cotton tees and denim for a complete look.',
    },
    {
      id: 'ret-7',
      name: 'Relaxed Fit Utility Denim Jacket',
      category: 'Apparel & Fashion',
      price: 2199,
      rating: 4.6,
      shop: 'Cyber Hub Apparel Co. (Shop A)',
      image: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=800&q=80',
      reason: 'Layering outerwear piece matching the UrbanCraft style.',
    },
    {
      id: 'ret-8',
      name: 'Formal Linen Button-Down Shirt',
      category: 'Apparel & Fashion',
      price: 1299,
      rating: 4.4,
      shop: 'Metro Threads Galleria (Shop B)',
      image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80',
      reason: 'Smart alternative for work and semi-formal occasions.',
    },
    {
      id: 'ret-4',
      name: 'Smart Stainless Steel Vacuum Insulated Flask (750ml)',
      category: 'Lifestyle & Everyday',
      price: 799,
      rating: 4.7,
      shop: 'Galleria Lifestyle Superstore',
      image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
      reason: 'Compact everyday companion under ₹1000.',
    },
  ];

  const recommendations = catalog.map((item) => ({
    ...item,
    fitsBudget: item.price <= budgetRemaining,
    budgetDiff: item.price - budgetRemaining,
  }));

  const exceedsBudget = recommendations.some((r) => !r.fitsBudget);
  const budgetAlert = exceedsBudget
    ? `Some recommended options (e.g. Denim Jacket at ₹2,199) exceed your current safe budget of ₹${Number(budgetRemaining).toLocaleString('en-IN')}. Consider budget-friendly alternatives like the Jeans (₹1,499) or Flask (₹799).`
    : `All recommended related items safely fit within your monthly budget of ₹${Number(budgetRemaining).toLocaleString('en-IN')}.`;

  return res.json({
    viewingProduct: productName,
    recommendations,
    budgetRemaining,
    budgetAlert,
    exceedsBudget,
  });
});

// -------------------------------------------------------------
// POST /api/ai/merchant-insights - Merchant Business AI Layer
// -------------------------------------------------------------
app.post('/api/ai/merchant-insights', async (req: Request, res: Response) => {
  const { productId = 'ret-1', orders = [] } = req.body;

  if (productId === 'insufficient-data') {
    return res.json({
      forecast: {
        productId,
        productName: 'Specialty Seasonal Reserve',
        category: 'Beverage',
        currentWeeklySales: 4,
        historicalTrend: [4],
        predictedNextWeek: 4,
        trendDirection: 'stable',
        confidenceLabel: 'Low (Insufficient Data)',
        insightText: 'Not enough historical data for a reliable forecast.',
        actionRecommendation: 'Accumulate at least 3 weeks of continuous sales records.',
        sufficientData: false,
      },
    });
  }

  // Realistic time series data: 20 -> 25 -> 31 -> 38
  const historicalTrend = [20, 25, 31, 38];
  const predictedNextWeek = 45;
  const growthPercent = Math.round(((38 - 20) / 20) * 100);

  return res.json({
    forecast: {
      productId: 'ret-1',
      productName: 'Premium Cotton Black T-Shirt',
      category: 'Apparel & Fashion',
      currentWeeklySales: 38,
      historicalTrend,
      predictedNextWeek,
      trendDirection: 'increasing',
      confidenceLabel: 'High (Demo Forecast)',
      insightText: `Demand shows an increasing trend across recent 4 weeks (20 → 25 → 31 → 38 units, +${growthPercent}%).`,
      actionRecommendation: 'Consider maintaining higher stock (+15 units) to avoid weekend stockout.',
      sufficientData: true,
    },
  });
});

// -------------------------------------------------------------
// POST /api/ai/admin-insights - Admin AI Platform Insights & Anomalies
// -------------------------------------------------------------
app.post('/api/ai/admin-insights', async (req: Request, res: Response) => {
  return res.json({
    dailySummary:
      'Today’s platform activity shows increased retail orders (+18%), stable hospitality bookings, and growing participation from Cyber Hub merchant partners. Platform error rate remains at 0.01%.',
    insights: [
      {
        id: 'adm-ins-1',
        vertical: 'Retail',
        title: 'Retail Price Comparison Engagement',
        metric: '+32.4% user comparisons',
        trend: 'Upward',
        observation: 'Retail activity has increased significantly compared with the previous period, particularly in apparel and electronics.',
      },
      {
        id: 'adm-ins-2',
        vertical: 'Hospitality',
        title: 'Weekend Dining Surge',
        metric: '88% table occupancy',
        trend: 'Stable High',
        observation: 'Cyber Hub fine dining reservations peaked Friday evening with 94% on-time fulfillment.',
      },
      {
        id: 'adm-ins-3',
        vertical: 'Entertainment',
        title: 'Entertainment Passes Velocity',
        metric: '28% of weekend bookings',
        trend: 'Growing',
        observation: 'Entertainment bookings represent a notable share of recent bookings, driven by VR gaming passes and comedy shows.',
      },
      {
        id: 'adm-ins-4',
        vertical: 'Merchants',
        title: 'Merchant Order Processing',
        metric: '97.2% acceptance rate',
        trend: 'Positive',
        observation: 'Several merchants show increasing order activity with average response time under 12 minutes.',
      },
    ],
  });
});

// -------------------------------------------------------------
// Vite Middleware & Static Serving Setup
// -------------------------------------------------------------
const PORT = 3000;

async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ServiGo server ready on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
});
