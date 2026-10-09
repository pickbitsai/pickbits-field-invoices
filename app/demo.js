// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices;
  function demoState(anchor = F.today()) {
    const s = F.emptyState();
    s.settings = { ...F.defaults(), name: 'Copper Finch Lawn Care', addressLines: ['1846 E Arroyo Verde Ave', 'Mesa, AZ 85204'], phone: '(480) 555-0140', email: 'copperfinch@example.com', prefix: 'CF-', technician: 'Daniel Reyes', terms: 'Payment due within 14 days.', instructions: 'Please include the invoice number with your payment.' };
    F.loadStarter(s, 'lawn'); s.services[0].price = 45; s.services[1].price = 30; s.materials[0].price = 8; s.materials[0].taxable = true;
    const households = [
      ['Laura Martinez', '1476 E Encanto Mesa Ave', 'lmartinez.home', 'Gate code 2468. Please latch the side gate.'],
      ['Robert Bennett', '3087 S Cobre Vista Dr', 'rob.bennett', 'Two dogs in the yard; ring the bell before opening the gate.'],
      ['Patricia Nguyen', '826 W Mesquite Ridge Ln', 'patricia.nguyen', 'Use the west gate. Keep clippings out of the pool.'],
      ['Carlos Ramirez', '2159 N Palo Sierra St', 'c.ramirez', 'Client asked about overseeding the front lawn this fall.'],
      ['Jennifer Brooks', '4638 E Cielo Arroyo Ct', 'jen.brooks', 'Please leave the hose coiled beside the garage.'],
      ['David Thompson', '1734 W Sandstone Mesa Ave', 'dthompson.house', 'Text before arrival so the dog can come inside.'],
      ['Sofia Hernandez', '2916 S Desert Laurel Dr', 'sofia.hernandez', 'Trim the oleanders below the back fence line.'],
      ['James Wilson', '684 E Juniper Crest Ln', 'james.wilson', 'Side gate sticks; lift the latch before pulling.'],
      ['Maria Torres', '3527 N Brisa Canyon St', 'maria.torres', 'Leave the planter along the patio alone.'],
      ['Linda Anderson', '1183 W Agave Terrace Ave', 'linda.anderson', 'Knock at the back door if the gate is locked.'],
      ['Jose Castillo', '4276 E Ocotillo Glen Dr', 'jcastillo.home', 'Keep the mower away from the new drip tubing.'],
      ['Kevin Patel', '963 S Sierra Laurel Ct', 'kevin.patel', 'Green bin is behind the east fence.'],
      ['Angela Davis', '2368 E Cobre Hollow Ln', 'angela.davis', 'Blow off the front steps before leaving.'],
      ['Miguel Garcia', '5172 W Loma Verde Ave', 'miguel.garcia', 'Back lawn stays damp near the shed; check before mowing.'],
      ['Susan Miller', '1349 N Sonoran Crest St', 'susan.miller', 'Please avoid visits before 8 a.m.'],
      ['Elena Morales', '2847 E Saguaro Glen Dr', 'elena.morales', 'Small dog uses the side yard. Close both gates.'],
      ['Thomas Clark', '749 S Arroyo Laurel Ln', 'tom.clark', 'Client wants the hedge kept level with the porch rail.'],
      ['Rebecca Johnson', '3962 W Acacia Mesa Ave', 'rebecca.johnson', 'Park clear of the driveway on service days.'],
      ['Luis Mendoza', '1658 E Tierra Crest Ct', 'lmendoza.home', 'Gate code 3816. Pull the gate closed until it clicks.'],
      ['Amy Chen', '2483 S Cactus Terrace Dr', 'amy.chen', 'Leave fallen citrus in the compost bin.'],
      ['Daniel Roberts', '5736 W Cielo Ridge Ln', 'dan.roberts', 'Please blow the gravel back from the sidewalk.'],
      ['Gabriela Lopez', '912 N Palo Cobre St', 'gabriela.lopez', 'Use the driveway gate; the alley gate is locked.'],
      ['Eric Williams', '3274 E Brisa Mesa Ave', 'eric.williams', 'Check the front sprinkler head near the mailbox.'],
      ['Rachel Adams', '1867 S Mesquite Hollow Dr', 'rachel.adams', 'Client prefers the grass a little taller in summer.'],
      ['Anthony Rivera', '4519 W Agave Crest Ct', 'arivera.home', 'Bag the front clippings; mulch the back lawn.']
    ];
    const workNotes = [
      'Mowed front and back, edged the driveway and blew off the patio.',
      'Trimmed the oleanders along the side fence and cleared the cuttings.',
      'Mowed at the higher setting and cleared grass from the sidewalk joints.',
      'Edged both walkways and pulled weeds around the front gravel bed.',
      'Cut the back lawn, tidied the tree wells and swept the pool deck.',
      'Mowed, touched up the hedge by the garage and cleared the curb.',
      'Finished the lawn and cleaned the leaves out of the entryway.'
    ];
    const visitDetails = [
      'Gate was open on arrival; latched it before leaving.',
      'Client brought the dogs inside before we started.',
      'Client asked about overseeding; will bring a quote next visit.',
      'Moved the hose off the grass and coiled it by the spigot.',
      'Checked the drip line by the patio; no visible leaks.',
      'Left the green bin by the side gate for pickup.',
      'Swept loose gravel back into the planting bed.',
      'Skipped the damp patch near the back sprinkler.',
      'Picked up fallen branches before mowing.',
      'Rinsed the mower tracks off the front walk.',
      'Cleared seed pods from around the citrus tree.',
      'Client asked us to leave the flowering shrubs this time.',
      'Tucked the loose irrigation tube back under the mulch.',
      'Pulled the grass runners along the west border.',
      'Bagged the extra clippings from the front lawn.',
      'Closed the pool gate and checked the latch.',
      'Swept the side passage after moving the bins back.',
      'Let the client know the south lawn could use more water.',
      'Used the side gate code and locked up after service.',
      'Left the patio chairs where the client had placed them.',
      'Cleared leaves from the drain by the garage.',
      'Kept the mower clear of the newly planted tree.',
      'Client approved keeping the lawn at the current height.',
      'Checked the front sprinkler after finding a dry edge.',
      'Moved the dog toys to the porch before starting.'
    ];
    for (let n = 0; n < 25; n++) {
      const [name, address, mailbox, notes] = households[n];
      const customer = { id: `demo-customer-${n}`, name, address, city: ['Mesa', 'Gilbert', 'Chandler'][n % 3], state: 'AZ', zip: ['85204', '85234', '85225'][n % 3], phone: `(480) 555-01${String(n + 50).padStart(2, '0')}`, email: `${mailbox}@example.${['com', 'org', 'net'][n % 3]}`, since: F.addDays(anchor, -95), notes, prices: { [s.services[0].id]: 45 + (n % 3) * 5 }, cycle: n % 2 ? { type: 'days', days: 14 } : { type: 'monthly' }, nextDue: F.addDays(anchor, n % 9 - 2) };
      s.customers.push(customer);
      const step = n % 2 ? 14 : 30;
      let visit = 0;
      for (let age = 88 - n % 8; age >= 7; age -= step) {
        const draft = F.blankDraft(s.settings, customer.id);
        draft.id = `demo-invoice-${n}-${age}`; draft.date = F.addDays(anchor, -age); draft.timeIn = '08:15'; draft.timeOut = '08:55';
        draft.services = [F.catalogueLine(s.services[0], customer)]; draft.notes = `${workNotes[visit++]} ${visitDetails[n]}`;
        if (n % 6 === 0) { draft.materials = [F.catalogueLine(s.materials[0])]; draft.materials[0].quantity = 2; }
        draft.taxRate = 0;
        if (age > step + 7 || n % 5 !== 0) { draft.money.amountPaid = F.totals(draft).total; draft.money.paymentType = n % 2 ? 'Cash' : 'Check'; }
        F.saveInvoice(s, draft);
      }
    }
    const correction = F.clone(s.invoices[0]); correction.notes += ' Trimmed the front hedge as agreed.';
    F.saveInvoice(s, correction, 'Added omitted visit detail.');
    s.draft = null; s.demoSeeded = true; return s;
  }
  F.demoState = demoState;
})();
