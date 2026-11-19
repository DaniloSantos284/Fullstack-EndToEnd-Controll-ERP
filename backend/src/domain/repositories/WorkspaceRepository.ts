import { Membership } from "../entities/Membership";
import { Workspace } from "../entities/Workspace";

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  /**
   * A implementação futura deve salvar workspace e proprietário atomicamente,
   * validar o vínculo ACTIVE/ADMINISTRATOR da conta proprietária e garantir a
   * unicidade global do vínculo ativo por conta com revalidação transacional.
   * O precheck da aplicação não implementa nem substitui essas garantias.
   */
  saveWithOwner(workspace: Workspace, ownerMembership: Membership): Promise<void>;
}
