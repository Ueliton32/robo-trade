
export type Provenance = 'DIRECT_ONCHAIN'|'DIRECT_INDEXER'|'DERIVED'|'ESTIMATED'|'MOCK';

export type CalcResult<T> = { value: T; provenance: Provenance; source?: string; timestamp?: number };

export function calcCurrentPositionValue(amount0: string, amount1: string, price0: string, price1: string): CalcResult<number> {
  const a0 = Number(amount0);
  const a1 = Number(amount1);
  const p0 = Number(price0);
  const p1 = Number(price1);
  const v0 = a0 * p0;
  const v1 = a1 * p1;
  return { value: v0+v1, provenance:'DERIVED' };
}

export function calcTotalFees(fees0:string,fees1:string,price0:string,price1:string):CalcResult<number>{
  const v0 = Number(fees0)*Number(price0);
  const v1 = Number(fees1)*Number(price1);
  return { value: v0+v1, provenance:'DERIVED' };
}

export function calcHodlValue(dep0:string,dep1:string,price0:string,price1:string):CalcResult<number>{
  const v0 = Number(dep0)*Number(price0);
  const v1 = Number(dep1)*Number(price1);
  return { value:v0+v1, provenance:'DERIVED' };
}

export function compare(v1:number,v2:number,tolAbs=1e-6,tolRel=0.001){
  const diff=Math.abs(v1-v2);
  if(diff<=tolAbs) return 'CALCULATION_MATCH';
  const rel=diff/Math.max(Math.abs(v1),Math.abs(v2),1);
  if(rel<=tolRel) return 'CALCULATION_MINOR_VARIANCE';
  return 'CALCULATION_MISMATCH';
}
