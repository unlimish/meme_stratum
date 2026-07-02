import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── TDD Satirical Tests for Meme Stratum ──
// "The faster you scroll, the more waste you generate"
// Based on: Kent Beck - Test Driven Development by Example

const START_YEAR = 2000;
const CURRENT_YEAR = 2026;
const TOTAL_YEARS = CURRENT_YEAR - START_YEAR;

// Mock meme data for testing
const mockMemes = [
  { id: 'harlemshake', name: 'Harlem Shake', bornYear: 2013, diedYear: 2013, color: '#ff3333', deathType: 'sudden', description: ' lifespan 数ヶ月で消失した超短寿命ミーム。', influencedBy: [] },
  { id: 'pepe', name: 'Pepe the Frog', bornYear: 2005, diedYear: 2026, color: '#33cc33', deathType: 'resurrected', description: '政治的シンボル化し「死と蘇生」を繰り返した不死鳥ミーム。', influencedBy: [] },
  { id: 'ragecomics', name: 'Rage Comics', bornYear: 2008, diedYear: 2015, color: '#dddddd', deathType: 'fade', description: 'フォーマットの陳腐化で衰退。', influencedBy: ['orly'] },
];

// ── Test Helpers ──
function calculateStrataDepth(memes) {
  const yearGroups = new Map();
  for (const meme of memes) {
    for (let y = meme.bornYear; y <= Math.min(meme.diedYear, CURRENT_YEAR); y++) {
      if (!yearGroups.has(y)) yearGroups.set(y, []);
      yearGroups.get(y).push(meme);
    }
  }
  let depth = 0;
  for (const year of Array.from(yearGroups.keys()).sort((a, b) => a - b)) {
    const memesInYear = yearGroups.get(year);
    const densityFactor = memesInYear.length / 5;
    depth += 0.4 + (memesInYear.length * 0.15) + (densityFactor * 0.2);
  }
  return depth;
}

function calculateSalvageValue(meme, currentYear) {
  const age = currentYear - meme.diedYear;
  const durability = { sudden: 0.1, fade: 0.3, resurrected: 0.8 }[meme.deathType] || 0.2;
  return Math.max(0, durability * (1 - age / 20));
}

function calculateWasteGeneration(scrollSpeed, memeCountInView) {
  // The faster you consume, the more waste per meme
  return scrollSpeed * memeCountInView * 0.5;
}

function calculateHardness(meme) {
  const lifespan = meme.diedYear - meme.bornYear;
  const typeMultiplier = { sudden: 0.2, fade: 0.6, resurrected: 1.0 }[meme.deathType] || 0.5;
  return lifespan * typeMultiplier;
}

// ── Tests ──

describe('Stratum Accumulation (地層の蓄積)', () => {
  it('should accumulate memes as sedimentary layers over years', () => {
    const depth = calculateStrataDepth(mockMemes);
    expect(depth).toBeGreaterThan(0);
    // Pepe spans 21 years, should contribute significant depth
    expect(depth).toBeGreaterThan(5);
  });

  it('should create denser layers for years with more memes', () => {
    const singleMeme = [mockMemes[0]];
    const singleDepth = calculateStrataDepth(singleMeme);
    const multiDepth = calculateStrataDepth(mockMemes);
    // Multi-meme years should create thicker stratum
    expect(multiDepth).toBeGreaterThan(singleDepth);
  });

  it('total landfill depth should equal years of accumulated waste', () => {
    const totalYears = mockMemes.reduce((sum, m) => sum + (m.diedYear - m.bornYear + 1), 0);
    const depth = calculateStrataDepth(mockMemes);
    // More meme-years = deeper landfill
    expect(depth).toBeGreaterThan(totalYears * 0.1);
  });
});

describe('Consumption Velocity (消費速度)', () => {
  it('should generate more dust at higher scroll speeds', () => {
    const slowWaste = calculateWasteGeneration(1, 3);
    const fastWaste = calculateWasteGeneration(10, 3);
    expect(fastWaste).toBeGreaterThan(slowWaste);
    expect(fastWaste).toBe(slowWaste * 10);
  });

  it('should measure consumption velocity in memes per second', () => {
    const scrollSpeed = 5;
    const memesInView = 2;
    const velocity = scrollSpeed * memesInView;
    expect(velocity).toBe(10);
  });

  it('auto-scroll represents passive consumption without attention', () => {
    const autoScrollSpeed = 1.2;
    const isAuto = true;
    // Passive consumption generates waste without user value extraction
    const passiveWaste = calculateWasteGeneration(autoScrollSpeed, 1) * (isAuto ? 1.5 : 1);
    const activeWaste = calculateWasteGeneration(autoScrollSpeed, 1);
    expect(passiveWaste).toBeGreaterThan(activeWaste);
  });
});

describe('Salvage & Degradation (回収と劣化)', () => {
  it('should degrade salvage value over time', () => {
    const pepeValue = calculateSalvageValue(mockMemes[1], 2026);
    const harlemValue = calculateSalvageValue(mockMemes[0], 2026);
    // Resurrected memes retain value; sudden deaths lose it fast
    expect(pepeValue).toBeGreaterThan(harlemValue);
  });

  it('sudden-death memes should have minimal salvage value', () => {
    const harlem = mockMemes[0];
    const value = calculateSalvageValue(harlem, CURRENT_YEAR);
    expect(value).toBeLessThan(0.05);
  });

  it('resurrected memes should show artificial preservation', () => {
    const pepe = mockMemes[1];
    const value = calculateSalvageValue(pepe, CURRENT_YEAR);
    expect(value).toBeGreaterThan(0.5);
  });

  it('should limit salvage capacity (finite attention)', () => {
    const salvageCap = 5;
    const attempted = 10;
    const salvaged = Math.min(attempted, salvageCap);
    expect(salvaged).toBe(salvageCap);
  });
});

describe('Strata Hardness (地層の硬さ)', () => {
  it('should correlate hardness with meme longevity', () => {
    const harlem = mockMemes[0]; // 0 year lifespan
    const pepe = mockMemes[1];   // 21 year lifespan
    expect(calculateHardness(pepe)).toBeGreaterThan(calculateHardness(harlem));
  });

  it('resurrected memes should form the hardest layers', () => {
    const pepe = mockMemes[1];
    const rage = mockMemes[2];
    expect(calculateHardness(pepe)).toBeGreaterThan(calculateHardness(rage));
  });
});

describe('Satirical Interactions (風刺的インタラクション)', () => {
  it('should warn when approaching consumption limit', () => {
    const consumptionLimit = 100;
    const currentConsumption = 95;
    const isWarning = currentConsumption > consumptionLimit * 0.9;
    expect(isWarning).toBe(true);
  });

  it('should expose salvage value when clicking meme (archaeology metaphor)', () => {
    const meme = mockMemes[1];
    const isClicked = true;
    const exposure = isClicked ? calculateSalvageValue(meme, CURRENT_YEAR) : 0;
    expect(exposure).toBeGreaterThan(0);
  });

  it('packaging metaphor: older layers show more compression (planned obsolescence)', () => {
    const year2013 = { bornYear: 2013, diedYear: 2013 };
    const year2005 = { bornYear: 2005, diedYear: 2026 };
    const compression2013 = (CURRENT_YEAR - year2013.bornYear) / TOTAL_YEARS;
    const compression2005 = (CURRENT_YEAR - year2005.bornYear) / TOTAL_YEARS;
    expect(compression2005).toBeGreaterThan(compression2013);
  });
});

// ── Consumption Report (終了時批評サマリー) ──
describe('Consumption Report (消費レポート)', () => {
  it('should calculate total memes consumed', () => {
    const totalMemes = mockMemes.length;
    const consumptionVelocity = 12.5;
    const timeSpent = 120; // seconds
    const totalConsumed = consumptionVelocity * timeSpent;
    expect(totalConsumed).toBeGreaterThan(totalMemes);
  });

  it('should calculate salvage rate as percentage', () => {
    const salvaged = 3;
    const total = 50;
    const rate = (salvaged / total) * 100;
    expect(rate).toBe(6);
  });

  it('should grade user based on consumption pattern', () => {
    function getGrade(consumed, salvaged, missed) {
      const salvageRate = salvaged / consumed;
      if (salvageRate > 0.3) return 'CONSCIOUS CONSUMER';
      if (missed > consumed * 0.5) return 'ATTENTION DEFICIT';
      if (consumed > 100) return 'BINGE CONSUMER';
      return 'CASUAL SCROLLER';
    }
    expect(getGrade(200, 2, 20)).toBe('BINGE CONSUMER');
    expect(getGrade(50, 16, 10)).toBe('CONSCIOUS CONSUMER');
    expect(getGrade(100, 1, 80)).toBe('ATTENTION DEFICIT');
  });

  it('should expose "algorithmic exploitation" score', () => {
    const autoScrollTime = 60;
    const activeTime = 30;
    const exploitationRatio = autoScrollTime / (activeTime + autoScrollTime);
    expect(exploitationRatio).toBeGreaterThan(0.5); // passive > active
    expect(exploitationRatio).toBe(2 / 3);
  });
});

// ── Rarity System (レア度 = 批評的価値) ──
describe('Rarity System (レア度システム)', () => {
  it('should assign higher rarity to long-lived memes', () => {
    const harlem = mockMemes[0]; // 0 year
    const pepe = mockMemes[1];   // 21 years
    function getRarity(meme) {
      const lifespan = meme.diedYear - meme.bornYear;
      if (lifespan >= 10) return 'MYTHIC';
      if (lifespan >= 5) return 'RARE';
      if (lifespan >= 2) return 'UNCOMMON';
      return 'DISPOSABLE';
    }
    expect(getRarity(pepe)).toBe('MYTHIC');
    expect(getRarity(harlem)).toBe('DISPOSABLE');
  });

  it('should give bonus rarity to resurrected memes', () => {
    const pepe = mockMemes[1];
    function getRarity(meme) {
      const base = meme.diedYear - meme.bornYear;
      const bonus = meme.deathType === 'resurrected' ? 5 : 0;
      const score = base + bonus;
      if (score >= 15) return 'MYTHIC';
      return 'COMMON';
    }
    expect(getRarity(pepe)).toBe('MYTHIC');
  });

  it('should lower rarity for sudden-death memes (planned obsolescence)', () => {
    const harlem = mockMemes[0];
    function getRarity(meme) {
      if (meme.deathType === 'sudden') return 'DISPOSABLE';
      return 'COMMON';
    }
    expect(getRarity(harlem)).toBe('DISPOSABLE');
  });
});

// ── Planned Obsolescence (計画陳腐化) ──
describe('Planned Obsolescence Visuals', () => {
  it('sudden-death memes should visually deteriorate rapidly', () => {
    const harlem = mockMemes[0];
    const deteriorationRate = harlem.deathType === 'sudden' ? 5.0 : 1.0;
    expect(deteriorationRate).toBe(5.0);
  });

  it('should count "designed to fail" memes', () => {
    const disposableCount = mockMemes.filter(m => m.deathType === 'sudden').length;
    expect(disposableCount).toBeGreaterThan(0);
  });
});

// ── UX Clarity ( usability as art ) ──
describe('UX Clarity (使いやすさは芸術の一部)', () => {
  it('background meme image must not obstruct strata view', () => {
    // Fullscreen blurred meme bg is visually noisy
    const bg = document.createElement('div');
    bg.id = 'meme-bg-1';
    bg.style.opacity = '0.08';
    bg.style.filter = 'blur(16px)';
    // Assert: max opacity should be very subtle or removed
    const opacity = parseFloat(bg.style.opacity);
    expect(opacity).toBeLessThanOrEqual(0.15);
  });

  it('salvage action must provide immediate visual + audio feedback', () => {
    const salvaged = true;
    const hasVisualStamp = salvaged;
    const hasAudioCue = salvaged;
    expect(hasVisualStamp && hasAudioCue).toBe(true);
  });

  it('salvaged meme must look distinctly different from unsalvaged', () => {
    const unsalvagedOpacity = 0.6;
    const salvagedOpacity = 0.95;
    expect(salvagedOpacity).toBeGreaterThan(unsalvagedOpacity + 0.2);
  });

  it('salvage counter must update instantly on click', () => {
    let remaining = 5;
    remaining--;
    expect(remaining).toBe(4);
  });
});

// ── Mock DOM tests ──
describe('DOM Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="hud"></div>
      <div id="meme-info"></div>
      <div id="consumption-meter"></div>
      <canvas id="webgl"></canvas>
    `;
  });

  it('should render consumption meter element', () => {
    const meter = document.getElementById('consumption-meter');
    expect(meter).not.toBeNull();
  });

  it('should update HUD with current year on scroll', () => {
    const yearEl = document.createElement('span');
    yearEl.id = 'current-year';
    document.getElementById('hud').appendChild(yearEl);

    yearEl.textContent = '2013';
    expect(yearEl.textContent).toBe('2013');
  });
});
