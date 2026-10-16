import { prisma } from './prisma';
import { Experiment, Prisma } from '@prisma/client';

export class ExperimentRegistry {
  async createExperiment(data: Prisma.ExperimentCreateInput): Promise<Experiment> {
    return await prisma.experiment.create({ data });
  }

  async getExperimentById(id: string): Promise<Experiment | null> {
    return await prisma.experiment.findUnique({ where: { id } });
  }

  async listExperiments(
    where: Prisma.ExperimentWhereInput = {},
    orderBy: Prisma.ExperimentOrderByWithRelationInput = { created_at: 'desc' },
    take?: number,
    skip?: number
  ): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where,
      orderBy,
      take,
      skip,
    });
  }

  async updateExperiment(
    id: string,
    data: Prisma.ExperimentUpdateInput
  ): Promise<Experiment> {
    return await prisma.experiment.update({ where: { id }, data });
  }

  async deleteExperiment(id: string): Promise<Experiment> {
    return await prisma.experiment.delete({ where: { id } });
  }

  async listByStatus(status: string): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
    });
  }

  async getByAgent(agent: string): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where: { agent },
      orderBy: { created_at: 'desc' },
    });
  }
}

// Singleton instance
export const experimentRegistry = new ExperimentRegistry();
