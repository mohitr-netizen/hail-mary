import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret!);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('Payment completed for session:', session.id);

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await db
      .from('hm_payment_sessions')
      .update({ status: 'paid' })
      .eq('session_id', session.id);

    if (error) {
      console.error('Failed to update payment session status:', error.message);
      // Return 200 anyway — Stripe will retry if we return non-2xx
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    await db
      .from('hm_payment_sessions')
      .update({ status: 'expired' })
      .eq('session_id', session.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
