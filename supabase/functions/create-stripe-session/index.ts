import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { order_amount, order_ref, store_slug } = await req.json();

    if (!order_amount || !order_ref || !store_slug) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: order_amount, order_ref, store_slug' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const POS_URL = Deno.env.get('POS_URL') ||
      'https://mohitr-netizen.github.io/hail-mary/pos.html';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `CaratLane Order ${order_ref}`,
            description: 'Fine Jewelry — CaratLane US',
          },
          unit_amount: Math.round(order_amount * 100), // convert dollars to cents
        },
        quantity: 1,
      }],
      success_url: `${POS_URL}?stripe_session_id={CHECKOUT_SESSION_ID}&order_ref=${encodeURIComponent(order_ref)}`,
      cancel_url: `${POS_URL}?stripe_cancelled=1`,
      metadata: { order_ref, store_slug },
      expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
    });

    // Write to staging table so POS can poll for payment status
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error: dbError } = await db.from('hm_payment_sessions').insert({
      session_id: session.id,
      store_slug,
      order_amount,
      order_ref,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    if (dbError) {
      console.error('DB insert error:', dbError.message);
      // Don't fail — QR still works; webhook will update status
    }

    return new Response(
      JSON.stringify({ session_id: session.id, url: session.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Error creating Stripe session:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
