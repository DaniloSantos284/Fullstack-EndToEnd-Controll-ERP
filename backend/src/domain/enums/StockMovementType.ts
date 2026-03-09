/**
* Enumeração que representa os tipos de movimentação de estoque.
* 
* Esta enumeração é utilizada para identificar as duas operações principais
* realizadas no sistema de gestão de estoque: entrada e saída de produtos.
* 
* Os tipos de movimento de estoque são definidos como:
* 
* - ENTRY: Representa a entrada de produtos no estoque.
* - EXIT: Representa a saída de produtos do estoque.
* 
* Exemplos de uso:
* 
* const movimento: StockMovementType = StockMovementType.ENTRY; (Registrar entrada)
* 
* const movimentoSaída: StockMovementType = StockMovementType.EXIT; (Registrar saída)
* 
*/


export enum StockMovementType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT'
}