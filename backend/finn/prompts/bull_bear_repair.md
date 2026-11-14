REPAIR PASS. You already wrote bull and bear points for this company; FINN's Python checks rejected some of them.
The JSON now also has:
- `kept`: the points that passed, per side. Do not repeat them or restate their facts.
- `rejected`: each rejected point with its side and the reason it failed.
- `need`: how many replacement points each side needs.

Write exactly `need` new points per side (0 means write none for that side), following every rule above. Fix the
stated reason: if a number was not in its cited evidence, cite the item that prints it or drop the number; if the why
was generic or named no driver, name the driver from the cited evidence in its own words. If the evidence has no
further sound point for a side, write fewer. Never re-submit a rejected point unchanged.
