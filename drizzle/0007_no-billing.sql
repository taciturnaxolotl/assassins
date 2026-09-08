-- Nothing is for sale. The dossier is either yours to read because you run the
-- game or it is the public half everybody gets, so an account has no plan.
ALTER TABLE `user` DROP COLUMN `plan`;
ALTER TABLE `user` DROP COLUMN `plan_until`;
