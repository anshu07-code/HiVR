ALTER TABLE employee_projects
  ADD COLUMN verification_status text DEFAULT NULL
  CHECK (verification_status IS NULL OR verification_status IN ('pending', 'approved', 'rejected'));
