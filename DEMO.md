# A 60-second walkthrough

Run `npm run demo` with Node 22 or newer. The browser opens the allocated loopback address on port 4205 with `?demo=1`. If it does not open automatically, copy the address printed in the terminal. No account, download of business data, or dependency install is needed.

The yellow DEMO banner is your check that you are in the separate fictional workspace. Copper Finch Lawn Care serves 25 invented customers in Mesa, Gilbert and Chandler. People and street addresses are synthetic; contacts use reserved example ranges. Visit dates are relative to the day you seed the demo, so there is always upcoming work. Monthly and every-14-days schedules, 111 invoices, five unpaid invoices and one corrected invoice are included. The seed has 25 customers due in the next seven days including six overdue. Each visit has distinct crew notes, and every property has a full Arizona address.

| Time | Show |
| --- | --- |
| 0–10 seconds | Today: the due count, stops today and outstanding invoices. Point out that data stays on this device. |
| 10–20 seconds | Open a customer. Show the 12-month strip, totals, service cycle and private notes. |
| 20–35 seconds | Start visit → Same as last time. Punch in, change a quantity or price, punch out, then Save invoice & preview. The new permanent number is visible. |
| 35–45 seconds | Switch to Visit summary: quantities remain, prices disappear. Switch back and show Print / PDF, Share image or Share text. The small attribution ends every document. |
| 45–55 seconds | History: use the Corrected filter and open the invoice and change log. Show month groups and search. Reports: switch between Due and Weekly stops. On a phone, open Reports from More. |
| 55–60 seconds | Settings → Backup: explain encrypted export. Finish on the yellow DEMO banner and Reset demo. |

Use only the demo’s synthetic data in screenshots or recordings. Do not send the demonstration invoice to an actual person; cancel the share sheet or save locally. The demo’s prices are examples, not recommended rates.

On phones, Today, Visit, Customers, History and More stay at the bottom of the screen. More opens Reports, Catalogue and Settings. History initially shows the newest 50 invoices; Show more adds the next 50. Desktop History uses a compact table with sticky month headings. Documents share a line-item table and aligned totals in preview, print/PDF and PNG.

After updating the app, use Reset demo before filming to load the current worked example into an already-seeded browser. Reset demo discards demo edits and reseeds dates relative to today. Real data is untouched. A demo backup is accepted only in demo mode. A real backup is accepted only in real mode. The installed manifest opens the normal workspace, so use the explicit demo URL for the walkthrough.

Press Ctrl+C in the terminal when finished. The server must be stopped before `npm run verify:browser`, since this project has only one allocated port. For your own empty workspace, use `npm start` and open the printed address without `?demo=1`.
