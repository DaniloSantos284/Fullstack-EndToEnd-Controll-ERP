import { Membership } from "../entities/Membership";

export interface MembershipRepository {
  findActiveByAccountId(id: string): Promise<Membership | null>;
  findById(id: string): Promise<Membership | null>;
  /**
   * A implementação futura deve garantir a unicidade global do vínculo ativo por
   * conta e revalidar o estado na transação. Prechecks não garantem concorrência.
   */
  save(membership: Membership): Promise<void>;
}
