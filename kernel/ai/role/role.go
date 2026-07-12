package role

type Role interface {
	Name() string
	DisplayName() string
	DefaultSystemPrompt() string
	ToolNames() []string
}

type Registry struct {
	roles map[string]Role
}

func NewRegistry() *Registry {
	return &Registry{roles: make(map[string]Role)}
}

func (r *Registry) Register(role Role) {
	r.roles[role.Name()] = role
}

func (r *Registry) Get(name string) (Role, bool) {
	role, ok := r.roles[name]
	return role, ok
}

func (r *Registry) List() []Role {
	list := make([]Role, 0, len(r.roles))
	for _, role := range r.roles {
		list = append(list, role)
	}
	return list
}
