# Hand corrections, applied at the end of the build (build_dataset.assemble).
# One per line in any *.txt file here except this one:
#   key | field.path | value
# key is the word's key (lowercase, hyphens for spaces). The path walks into
# the entry with dots; numbers pick a list item (nuance.traditions.2.view).
# A value starting with [ or { is read as JSON; anything else is text.
# A line whose path or key no longer exists stops the build, so a fix can't
# silently stop applying.
