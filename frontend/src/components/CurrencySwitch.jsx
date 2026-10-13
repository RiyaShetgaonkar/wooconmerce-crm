// frontend/src/components/CurrencySwitch.jsx
// $ / ₹ toggle with an editable exchange rate.
import { useState } from 'react';
import { CURRENCIES, useCurrency } from '../hooks/useCurrency';

export default function CurrencySwitch() {
  const { currency, setCurrency, inrPerUsd, setRate } = useCurrency();
  const [rateInput, setRateInput] = useState(String(inrPerUsd));

  const commitRate = () => {
    if (Number(rateInput) > 0) setRate(rateInput);
    else setRateInput(String(inrPerUsd));
  };

  return (
    <div className="currency-switch">
      <div className="seg-toggle" role="radiogroup" aria-label="Display currency">
        {Object.values(CURRENCIES).map((c) => (
          <button
            key={c.code}
            type="button"
            role="radio"
            aria-checked={currency === c.code}
            className={currency === c.code ? 'active' : ''}
            onClick={() => setCurrency(c.code)}
          >
            {c.symbol} {c.label}
          </button>
        ))}
      </div>
      <label className="rate-field" title="Exchange rate used to convert amounts">
        <span>$1 =</span>
        <span>₹</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className="input input-sm"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          onBlur={commitRate}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Rupees per US dollar"
        />
      </label>
    </div>
  );
}
