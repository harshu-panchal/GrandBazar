# WhatsApp templates to create in the BhashSMS dashboard

Category: **Utility**, language: English. Variables are positional and must be sent in this order
(see `app/services/bhashWhatsappService.js`). Names can be changed via the `BHASHSMS_TPL_*` env vars.

| Env var | Default name | Body |
|---|---|---|
| `BHASHSMS_TPL_PAY_LINK` | `zinto_order_pay_link` | `Hi {{1}}, your order {{2}} of Rs.{{3}} is ready. Pay securely here: {{4}}. This link is valid for 30 minutes.` |
| `BHASHSMS_TPL_TRACKING` | `zinto_order_tracking` | `Hi {{1}}, track your order {{2}} live here: {{3}}` |
| `BHASHSMS_TPL_RIDER_TASK` | `zinto_rider_task` | `Hi {{1}}, you have a new {{2}} task for order {{3}}. Open it here: {{4}}` |

Notes: `{{2}}` in the rider template is `delivery` or `return pickup`. The rider link contains a `#token=` fragment,
so the URL must be a body variable (not a fixed-prefix button URL).
