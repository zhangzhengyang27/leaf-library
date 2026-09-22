/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { useRoute, useRouter } from "vue-router";
export function useRunInLibrary() {
  const router = useRouter();
  const route = useRoute();
  return (fn) => {
    void (async () => {
      if (String(route.name || "") !== "photos") await router.push("/photos");
      fn();
    })();
  };
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVzZVJ1bkluTGlicmFyeS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB1c2VSb3V0ZSwgdXNlUm91dGVyIH0gZnJvbSAndnVlLXJvdXRlcidcblxuLyoqXG4gKiDljYHkupTova4gQzE0IC8g5a6h5p+lIFAyLTIz77ya6YCJ5oupL+aJuemHjy/lvLnnqpfnsbvliqjkvZzkvp3otZYgcGhvdG9zIOinhuWbvuaMgui9veeahFxuICog57uE5Lu25LiO6YCJ5Lit5oCB77yM5Zyo5YW25a6D6Lev55Sx6Kem5Y+R5pe25YWI5YiH5ZueIC9waG90b3Mg5YaN5omn6KGM44CCXG4gKiBBcHAudnVlIOWOn+eUn+iPnOWNleOAgVRpdGxlQmFyIOWvvOWFpeiPnOWNleOAgUxpYnJhcnlDb21tYW5kUGFsZXR0ZSDlhbHnlKjjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVzZVJ1bkluTGlicmFyeSgpOiAoZm46ICgpID0+IHZvaWQpID0+IHZvaWQge1xuICBjb25zdCByb3V0ZXIgPSB1c2VSb3V0ZXIoKVxuICBjb25zdCByb3V0ZSA9IHVzZVJvdXRlKClcbiAgcmV0dXJuIChmbjogKCkgPT4gdm9pZCk6IHZvaWQgPT4ge1xuICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChTdHJpbmcocm91dGUubmFtZSB8fCAnJykgIT09ICdwaG90b3MnKSBhd2FpdCByb3V0ZXIucHVzaCgnL3Bob3RvcycpXG4gICAgICBmbigpXG4gICAgfSkoKVxuICB9XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsVUFBVSxpQkFBaUI7QUFPN0IsZ0JBQVMsa0JBQTRDO0FBQzFELFFBQU0sU0FBUyxVQUFVO0FBQ3pCLFFBQU0sUUFBUSxTQUFTO0FBQ3ZCLFNBQU8sQ0FBQyxPQUF5QjtBQUMvQixVQUFNLFlBQVk7QUFDaEIsVUFBSSxPQUFPLE1BQU0sUUFBUSxFQUFFLE1BQU0sU0FBVSxPQUFNLE9BQU8sS0FBSyxTQUFTO0FBQ3RFLFNBQUc7QUFBQSxJQUNMLEdBQUc7QUFBQSxFQUNMO0FBQ0Y7IiwibmFtZXMiOltdfQ==