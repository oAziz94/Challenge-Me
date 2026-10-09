-- Foundation Task 3 database baseline (Foundation brief section 9 and 20 task 3; DM section 4 and 22; STACK-ADR-003).
-- Creates the fourteen module schemas and the audit schema, each owned by cm_migrator (DM section 6.4: owner of all schemas).
-- No role, grant, table or default privilege is created here: roles and the bootstrap schema are provider-plane, and no grant
-- beyond what the contract states is established (DM section 6.4). The foundation resolver schema belongs to task 4a.
CREATE SCHEMA identity AUTHORIZATION cm_migrator;
CREATE SCHEMA roster AUTHORIZATION cm_migrator;
CREATE SCHEMA tenancy AUTHORIZATION cm_migrator;
CREATE SCHEMA privacy AUTHORIZATION cm_migrator;
CREATE SCHEMA content AUTHORIZATION cm_migrator;
CREATE SCHEMA challenge AUTHORIZATION cm_migrator;
CREATE SCHEMA assessment AUTHORIZATION cm_migrator;
CREATE SCHEMA evaluation AUTHORIZATION cm_migrator;
CREATE SCHEMA learning AUTHORIZATION cm_migrator;
CREATE SCHEMA review AUTHORIZATION cm_migrator;
CREATE SCHEMA comms AUTHORIZATION cm_migrator;
CREATE SCHEMA ai AUTHORIZATION cm_migrator;
CREATE SCHEMA codeexec AUTHORIZATION cm_migrator;
CREATE SCHEMA reporting AUTHORIZATION cm_migrator;
CREATE SCHEMA audit AUTHORIZATION cm_migrator;
