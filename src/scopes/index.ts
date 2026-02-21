import { ScopeDefinition } from './types';
import { ScopeName } from '../types';
import { restaurantScope } from './restaurant';
import { generalInfoScope } from './general-info';
import { appointmentScope } from './appointment';
import { generalScope } from './general';

const scopes: Record<ScopeName, ScopeDefinition> = {
  restaurant: restaurantScope,
  general_info: generalInfoScope,
  appointment: appointmentScope,
  general: generalScope,
};

export function getScope(name: ScopeName): ScopeDefinition {
  const scope = scopes[name];
  if (!scope) throw new Error(`Unknown scope: ${name}`);
  return scope;
}

export { scopes };
