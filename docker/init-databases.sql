-- Runs once, on first initialisation of the postgres volume.
--
-- caribpay       the switch: directory, clearing ledger, positions
-- caribpay_bank  the member banks: customer accounts and balances
--
-- These are separate databases on purpose. The switch holds no customer money,
-- and it has no business being able to read a balance out of its own tables —
-- the boundary is enforced by connection configuration, not by convention.
CREATE DATABASE caribpay_bank;
CREATE DATABASE caribpay_test;
CREATE DATABASE caribpay_bank_test;
