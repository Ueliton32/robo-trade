export type RuleEvaluation = {
  id: string;
  name: string;
  result: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  priority: number;
  description: string;
  metrics_used: string[];
};

export type RuleContext = any;

export class RuleEngine {
  private rules: {
    id: string;
    name: string;
    description: string;
    priority: number;
    condition: (ctx: RuleContext) => boolean;
    result: string;
    metrics: string[];
  }[];

  constructor() {
    this.rules = [
      {
        id: 'R001',
        name: 'Portfolio alpha positive',
        description: 'LP alpha percentage is positive',
        priority: 100,
        condition: (ctx) => typeof ctx.portfolio.lp_alpha_pct === 'number' && ctx.portfolio.lp_alpha_pct > 0,
        result: 'HEALTHY',
        metrics: ['lp_alpha_pct']
      },
      {
        id: 'R002',
        name: 'Portfolio alpha negative severe',
        description: 'LP alpha percentage below -5%',
        priority: 90,
        condition: (ctx) => typeof ctx.portfolio.lp_alpha_pct === 'number' && ctx.portfolio.lp_alpha_pct < -5,
        result: 'UNHEALTHY',
        metrics: ['lp_alpha_pct']
      },
      {
        id: 'R003',
        name: 'Opportunity score high',
        description: 'Opportunity score >= 70',
        priority: 80,
        condition: (ctx) => typeof ctx.opportunity.opportunity_score === 'number' && ctx.opportunity.opportunity_score >= 70,
        result: 'STRONG_CANDIDATE',
        metrics: ['opportunity_score']
      },
      {
        id: 'R004',
        name: 'Opportunity score low',
        description: 'Opportunity score < 30',
        priority: 80,
        condition: (ctx) => typeof ctx.opportunity.opportunity_score === 'number' && ctx.opportunity.opportunity_score < 30,
        result: 'ROTATE_CANDIDATE',
        metrics: ['opportunity_score']
      },
      {
        id: 'R005',
        name: 'In range check',
        description: 'Position is out of range',
        priority: 70,
        condition: (ctx) => ctx.portfolio.current_position && ctx.portfolio.current_position.in_range === false,
        result: 'WATCH',
        metrics: ['in_range']
      },
      {
        id: 'R006',
        name: 'Risk score high',
        description: 'Risk score >= 70',
        priority: 70,
        condition: (ctx) => typeof ctx.opportunity.risk_score === 'number' && ctx.opportunity.risk_score >= 70,
        result: 'REVIEW',
        metrics: ['risk_score']
      },
      {
        id: 'R007',
        name: 'Macro regime bearish',
        description: 'Macro regime state is BEARISH',
        priority: 60,
        condition: (ctx) => ctx.market_context.macro_regime && ctx.market_context.macro_regime.state === 'BEARISH',
        result: 'WATCH',
        metrics: ['macro_regime.state']
      },
      {
        id: 'R008',
        name: 'Liquidity regime low',
        description: 'Liquidity regime confidence < 30',
        priority: 50,
        condition: (ctx) => ctx.market_context.liquidity_regime && typeof ctx.market_context.liquidity_regime.confidence === 'number' && ctx.market_context.liquidity_regime.confidence < 30,
        result: 'WATCH',
        metrics: ['liquidity_regime.confidence']
      },
      {
        id: 'R009',
        name: 'Crypto regime extreme fear',
        description: 'Crypto regime state is EXTREME_FEAR',
        priority: 40,
        condition: (ctx) => ctx.market_context.crypto_regime && ctx.market_context.crypto_regime.state === 'EXTREME_FEAR',
        result: 'REVIEW',
        metrics: ['crypto_regime.state']
      },
    ];
  }

  evaluate(ctx: RuleContext): RuleEvaluation[] {
    const evaluations: RuleEvaluation[] = [];
    for (const rule of this.rules) {
      let result: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
      try {
        if (rule.condition(ctx)) {
          result = 'PASS';
        }
      } catch {
        result = 'NOT_APPLICABLE';
      }
      evaluations.push({
        id: rule.id,
        name: rule.name,
        result,
        priority: rule.priority,
        description: rule.description,
        metrics_used: rule.metrics
      });
    }
    return evaluations.sort((a, b) => b.priority - a.priority);
  }

  getRules() {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      priority: r.priority,
      result: r.result,
      metrics: r.metrics
    }));
  }
}