import { NextRequest, NextResponse } from 'next/server';
import { DecisionEngine } from '@/lib/monitoring/lp/decision-engine/decision-engine';

export async function GET(request: NextRequest) {
  try {
    const engine = new DecisionEngine();
    const report = engine.run();
    return NextResponse.json(report);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to load report' }, { status: 500 });
  }
}
