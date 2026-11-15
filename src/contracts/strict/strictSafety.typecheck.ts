// Checked only by tsconfig.strict.json; these assertions need strict semantics.
type False<T extends false> = T;

type NullIsNotText = False<null extends string ? true : false>;
type UndefinedIsNotNumber = False<undefined extends number ? true : false>;

// A callback that requires text cannot safely handle an optional text argument.
type RequiredHandlerIsNotOptionalHandler = False<
  ((value: string) => void) extends ((value: string | undefined) => void) ? true : false
>;

export {};
