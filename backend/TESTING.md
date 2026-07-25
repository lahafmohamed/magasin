# Tests backend sans risque

La suite backend contient des tests d'intégration qui créent et suppriment des
données. Elle ne doit jamais être exécutée sur la base de développement ou sur
une base métier.

## Base locale autorisée

1. Créer une base PostgreSQL jetable dont le nom se termine par `_test`, par
   exemple `hitek_local_test`.
2. Charger le schéma et les données de référence avec la même procédure que la
   CI.
3. Fournir explicitement l'environnement de test avant d'exécuter Vitest:

```powershell
$env:NODE_ENV = 'test'
$env:DB_NAME = 'hitek_local_test'
npm test
```

La CI est également autorisée à utiliser sa base dédiée `magasin_ci`.

## Protection automatique

`src/test/globalSetup.ts` et `src/test/setup.ts` s'exécutent avant les fichiers
de test. La suite s'arrête immédiatement si:

- `NODE_ENV` n'est pas exactement `test`;
- `DB_NAME` est absent;
- le nom ne se termine pas par `_test` et n'est pas `magasin_ci`.

Après validation de cette garde, le schéma `public` de la base jetable est
reconstruit depuis le baseline CI avant et après chaque exécution. Les fichiers
de test sont exécutés en série, car leurs fixtures d'intégration partagent la
même base. Les exécutions répétées restent ainsi déterministes et ne laissent
pas de données de test accumulées.

La base courante `pbdsarl` est donc refusée avant toute requête de test. Toute
base acceptée par la garde est automatiquement réinitialisée; elle doit être
strictement jetable.
