export interface Bottle {
  name: string;
  capacity: number;
  originalCapacity?: number;
  serving: number;
}

export interface Ingredient {
  name: string;
  serving: number;
  manual?: boolean;
  wait?: number;
}

export interface Recipe {
  name?: string; // stable id, assigned once saved
  friendlyname: string;
  ingredients: Ingredient[];
  imageUrl?: string;
}

export interface PourResult {
  success: boolean;
  pourTime: number;
  error?: string;
}

export interface ServoStateEvent {
  servos?: boolean[];
  bottles?: Bottle[];
  drinks?: Recipe[];
  buttonsDisabled?: boolean;
}
