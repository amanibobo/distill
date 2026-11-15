alter table events drop constraint if exists events_change_type_check;
alter table events add constraint events_change_type_check check (
  change_type in ('flood', 'fire_scar', 'harvest', 'crop_growth', 'deforestation', 'glacier_movement', 'ground_deformation', 'other')
);
